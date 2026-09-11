import Foundation
import HealthKit

/// Reads the last N days of Apple Health data and shapes it into the
/// server's ingest payload. Read-only: Vital never writes to Health.
final class HealthKitReader {

    let store = HKHealthStore()

    /// Everything Vital asks permission for — the phone shows each one
    /// separately and dad approves them one by one (project rule #1).
    private var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [
            HKQuantityType(.heartRate),
            HKQuantityType(.heartRateVariabilitySDNN),
            HKQuantityType(.restingHeartRate),
            HKQuantityType(.respiratoryRate),
            HKQuantityType(.oxygenSaturation),
            HKQuantityType(.vo2Max),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.stepCount),
            HKQuantityType(.distanceWalkingRunning),
            HKQuantityType(.distanceCycling),
            HKObjectType.workoutType(),
        ]
        types.insert(HKCategoryType(.sleepAnalysis))
        return types
    }

    static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestPermission() async throws {
        try await store.requestAuthorization(toShare: [], read: readTypes)
    }

    /// Builds the complete upload body for the last `days` days.
    func buildPayload(days: Int) async throws -> [String: Any] {
        let calendar = Calendar.current
        let endDate = Date()
        let startDate = calendar.startOfDay(for: calendar.date(byAdding: .day, value: -(days - 1), to: endDate)!)

        var metrics: [[String: Any]] = []

        // Daily averages (gauge-style metrics).
        // The last element is a scale factor: HealthKit reports blood oxygen as a
        // 0–1 fraction, while the server's contract (and Health Auto Export) uses
        // percent — 97.5, not 0.975. Everything else is already in the right unit.
        let averaged: [(HKQuantityTypeIdentifier, String, String, HKUnit, Double)] = [
            (.restingHeartRate, "resting_heart_rate", "count/min", HKUnit.count().unitDivided(by: .minute()), 1),
            (.respiratoryRate, "respiratory_rate", "count/min", HKUnit.count().unitDivided(by: .minute()), 1),
            (.oxygenSaturation, "blood_oxygen_saturation", "%", HKUnit.percent(), 100),
            (.vo2Max, "vo2_max", "mL/kg/min",
             HKUnit.literUnit(with: .milli).unitDivided(by: HKUnit.gramUnit(with: .kilo).unitMultiplied(by: .minute())), 1),
        ]
        for (identifier, name, units, unit, scale) in averaged {
            let rows = try await dailyStats(identifier, .discreteAverage, unit, from: startDate, to: endDate) { stats in
                stats.averageQuantity().map { ["qty": round2($0.doubleValue(for: unit) * scale)] }
            }
            if !rows.isEmpty { metrics.append(Payload.metric(name: name, units: units, rows: rows)) }
        }

        // Daily sums (count-style metrics).
        // The last element says how to round: steps are counted things and come
        // back from HealthKit as floats often enough to matter (11623.858733),
        // which reads back as "11,623.86 steps". Energy needs one decimal, not six.
        let summed: [(HKQuantityTypeIdentifier, String, String, HKUnit, Bool)] = [
            (.activeEnergyBurned, "active_energy", "kcal", HKUnit.kilocalorie(), false),
            (.stepCount, "step_count", "steps", HKUnit.count(), true),
        ]
        for (identifier, name, units, unit, whole) in summed {
            let rows = try await dailyStats(identifier, .cumulativeSum, unit, from: startDate, to: endDate) { stats in
                stats.sumQuantity().map { q in
                    let v = q.doubleValue(for: unit)
                    return ["qty": whole ? v.rounded() : (v * 10).rounded() / 10]
                }
            }
            if !rows.isEmpty { metrics.append(Payload.metric(name: name, units: units, rows: rows)) }
        }

        // Heart rate: min/avg/max per day.
        let bpm = HKUnit.count().unitDivided(by: .minute())
        let hrRows = try await dailyStats(.heartRate, [.discreteMin, .discreteAverage, .discreteMax], bpm,
                                          from: startDate, to: endDate) { stats in
            var row: [String: Any] = [:]
            if let v = stats.minimumQuantity() { row["Min"] = v.doubleValue(for: bpm) }
            if let v = stats.averageQuantity() { row["Avg"] = v.doubleValue(for: bpm) }
            if let v = stats.maximumQuantity() { row["Max"] = v.doubleValue(for: bpm) }
            return row.isEmpty ? nil : row
        }
        if !hrRows.isEmpty { metrics.append(Payload.metric(name: "heart_rate", units: "count/min", rows: hrRows)) }

        let hrv = try await hrvRows(from: startDate, to: endDate)
        if !hrv.isEmpty {
            metrics.append(Payload.metric(name: "heart_rate_variability", units: "ms", rows: hrv))
        }

        if let sleepMetric = try await sleepMetric(from: startDate, to: endDate) {
            metrics.append(sleepMetric)
        }

        let workouts = try await workoutRows(from: startDate, to: endDate)

        return Payload.body(metrics: metrics, workouts: workouts)
    }

    // MARK: - Daily quantity statistics

    private func dailyStats(_ identifier: HKQuantityTypeIdentifier,
                            _ options: HKStatisticsOptions,
                            _ unit: HKUnit,
                            from startDate: Date, to endDate: Date,
                            extract: @escaping (HKStatistics) -> [String: Any]?) async throws -> [[String: Any]] {
        let type = HKQuantityType(identifier)
        let datePredicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate)
        let descriptor = HKStatisticsCollectionQueryDescriptor(
            predicate: HKSamplePredicate.quantitySample(type: type, predicate: datePredicate),
            options: options,
            anchorDate: Calendar.current.startOfDay(for: startDate),
            intervalComponents: DateComponents(day: 1)
        )
        let collection = try await descriptor.result(for: store)
        var rows: [[String: Any]] = []
        collection.enumerateStatistics(from: startDate, to: endDate) { stats, _ in
            if var row = extract(stats) {
                // Stamp the row with midday so timezone edges can't shift the day.
                let midday = Calendar.current.date(byAdding: .hour, value: 12, to: stats.startDate)!
                row["date"] = Payload.date(midday)
                rows.append(row)
            }
        }
        return rows
    }

    // MARK: - Reading long histories

    /// Splits a date range into windows to read one at a time.
    ///
    /// The statistics queries above hand back one aggregate per day whatever
    /// the range, but the three sample queries below hand back every sample.
    /// Over "All" — twelve years — that is tens of thousands of objects alive
    /// at once, and the sleep grouping then holds every one of them in nested
    /// dictionaries while it works. A phone kills an app that asks for that
    /// much, with no crash the person can see: the app simply disappears.
    ///
    /// Each window starts a day before the last one ended, so a night that
    /// straddles a seam is seen whole by the later window. Rows are keyed by
    /// date afterwards, so seeing a day twice is harmless.
    private static func windows(from: Date, to: Date, days: Int = 60) -> [(start: Date, end: Date)] {
        guard from < to else { return [] }
        let step = TimeInterval(days * 86_400)
        let overlap = TimeInterval(86_400)
        var out: [(start: Date, end: Date)] = []
        var cursor = from
        while cursor < to {
            let end = min(cursor.addingTimeInterval(step), to)
            out.append((start: max(from, cursor.addingTimeInterval(-overlap)), end: end))
            cursor = end
        }
        return out
    }

    /// Merge rows from several windows, keeping one per date.
    private static func mergedByDate(_ rows: [[String: Any]]) -> [[String: Any]] {
        var byDate: [String: [String: Any]] = [:]
        for row in rows {
            guard let key = row["date"] as? String else { continue }
            byDate[key] = row
        }
        return byDate.keys.sorted().compactMap { byDate[$0] }
    }

    // MARK: - Heart rate variability

    /// HRV as the median of one device's overnight readings.
    ///
    /// Averaging every reading in a day blends measurement regimes: a watch
    /// samples opportunistically while you move about, and a strap or ring
    /// measures at rest overnight and reads systematically higher. Mixing them
    /// makes the 42-day baseline a fiction, and a daily mean then swings on how
    /// active the day was rather than on how recovered the person is. So: one
    /// device, readings taken at night, and the median rather than the mean,
    /// because a single startled reading should not move the number.
    private func hrvRows(from startDate: Date, to endDate: Date) async throws -> [[String: Any]] {
        var rows: [[String: Any]] = []
        for window in Self.windows(from: startDate, to: endDate) {
            rows += try await hrvRowsIn(from: window.start, to: window.end)
        }
        return Self.mergedByDate(rows)
    }

    private func hrvRowsIn(from startDate: Date, to endDate: Date) async throws -> [[String: Any]] {
        let type = HKQuantityType(.heartRateVariabilitySDNN)
        let unit = HKUnit.secondUnit(with: .milli)
        let predicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate)
        let descriptor = HKSampleQueryDescriptor(
            predicates: [HKSamplePredicate.quantitySample(type: type, predicate: predicate)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        let samples = try await descriptor.result(for: store)
        guard !samples.isEmpty else { return [] }

        let calendar = Calendar.current
        var byNight: [String: [String: [Double]]] = [:]
        for sample in samples {
            let hour = calendar.component(.hour, from: sample.startDate)
            // Keep the night: from 22:00 to 11:00. A reading before midnight
            // belongs to the night that ends the following morning.
            guard hour >= 22 || hour < 11 else { continue }
            let attributed = hour >= 22
                ? (calendar.date(byAdding: .day, value: 1, to: sample.startDate) ?? sample.startDate)
                : sample.startDate
            let key = Self.dayKey.string(from: attributed)
            let source = sample.sourceRevision.source.bundleIdentifier
            var devices = byNight[key] ?? [:]
            devices[source, default: []].append(sample.quantity.doubleValue(for: unit))
            byNight[key] = devices
        }

        let tzSuffix = String(Payload.dateFormatter.string(from: Date()).suffix(5))
        var rows: [[String: Any]] = []
        for (key, devices) in byNight.sorted(by: { $0.key < $1.key }) {
            // Whichever device took the most readings is the one that was
            // actually worn to bed.
            guard let readings = devices.values.max(by: { $0.count < $1.count }),
                  !readings.isEmpty else { continue }
            rows.append(["date": "\(key) 12:00:00 \(tzSuffix)", "qty": round2(median(readings))])
        }
        return rows
    }

    private func median(_ values: [Double]) -> Double {
        let sorted = values.sorted()
        let mid = sorted.count / 2
        return sorted.count % 2 == 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    }

    // MARK: - Sleep

    /// One night as a single device recorded it, in hours.
    private struct Night {
        var core = 0.0, deep = 0.0, rem = 0.0, unspecified = 0.0, awake = 0.0, inBed = 0.0
        var start: Date?, end: Date?
        var asleep: Double { core + deep + rem + unspecified }
        /// A watch splits sleep into stages; a phone usually logs one flat block.
        var staged: Bool { core > 0 || deep > 0 || rem > 0 }
    }

    private struct Span { var start: Date; var end: Date }

    private static let dayKey: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private func sleepMetric(from startDate: Date, to endDate: Date) async throws -> [String: Any]? {
        var rows: [[String: Any]] = []
        for window in Self.windows(from: startDate, to: endDate) {
            rows += try await sleepRowsIn(from: window.start, to: window.end)
        }
        let merged = Self.mergedByDate(rows)
        guard !merged.isEmpty else { return nil }
        return Payload.metric(name: "sleep_analysis", units: "hr", rows: merged)
    }

    private func sleepRowsIn(from startDate: Date, to endDate: Date) async throws -> [[String: Any]] {
        let type = HKCategoryType(.sleepAnalysis)
        let datePredicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate)
        let descriptor = HKSampleQueryDescriptor(
            predicates: [HKSamplePredicate.categorySample(type: type, predicate: datePredicate)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        let samples = try await descriptor.result(for: store)
        guard !samples.isEmpty else { return [] }

        // An iPhone and an Apple Watch both record the same night, so adding up
        // every sample counts those hours twice — 15 hours of sleep instead of 7.
        // Group by night and by which device wrote each sample, then keep just
        // one device's account of each night.
        var byNight: [String: [String: [HKCategorySample]]] = [:]
        for sample in samples {
            let key = Self.dayKey.string(from: sample.endDate)
            let source = sample.sourceRevision.source.bundleIdentifier
            var sources = byNight[key] ?? [:]
            sources[source, default: []].append(sample)
            byNight[key] = sources
        }

        var rows: [[String: Any]] = []
        let tzSuffix = String(Payload.dateFormatter.string(from: Date()).suffix(5))
        for (key, bySource) in byNight.sorted(by: { $0.key < $1.key }) {
            // Prefer the device that breaks the night into stages; between two
            // that both do, the one that saw more of it.
            let candidates = bySource.values.map { nightTotals($0) }
            guard let night = candidates.max(by: { a, b in
                if a.staged != b.staged { return b.staged }
                return a.asleep < b.asleep
            }) else { continue }
            guard night.asleep > 0 || night.inBed > 0 else { continue }
            var row: [String: Any] = [
                "date": "\(key) 12:00:00 \(tzSuffix)",
                "totalSleep": round2(night.asleep),
                "core": round2(night.core + night.unspecified),
                "deep": round2(night.deep),
                "rem": round2(night.rem),
                "awake": round2(night.awake),
            ]
            if night.inBed > 0 { row["inBed"] = round2(night.inBed) }
            if let s = night.start { row["sleepStart"] = Payload.date(s) }
            if let e = night.end { row["sleepEnd"] = Payload.date(e) }
            rows.append(row)
        }
        return rows
    }

    /// Totals for one device's samples. Overlapping stretches of the same stage
    /// are merged rather than added — a device can log the same minutes twice.
    private func nightTotals(_ samples: [HKCategorySample]) -> Night {
        var spans: [Int: [Span]] = [:]
        var night = Night()
        for sample in samples {
            spans[sample.value, default: []].append(Span(start: sample.startDate, end: sample.endDate))
            if night.start == nil || sample.startDate < night.start! { night.start = sample.startDate }
            if night.end == nil || sample.endDate > night.end! { night.end = sample.endDate }
        }
        for (value, list) in spans {
            let hours = Self.mergedHours(list)
            switch HKCategoryValueSleepAnalysis(rawValue: value) {
            case .asleepCore: night.core = hours
            case .asleepDeep: night.deep = hours
            case .asleepREM: night.rem = hours
            case .asleepUnspecified: night.unspecified = hours
            case .awake: night.awake = hours
            case .inBed: night.inBed = hours
            default: break
            }
        }
        return night
    }

    /// How much wall-clock time a set of spans covers between them, in hours.
    private static func mergedHours(_ spans: [Span]) -> Double {
        let sorted = spans.sorted { $0.start < $1.start }
        var seconds = 0.0
        var current: Span?
        for span in sorted {
            guard var open = current else { current = span; continue }
            if span.start <= open.end {
                if span.end > open.end { open.end = span.end }
                current = open
            } else {
                seconds += open.end.timeIntervalSince(open.start)
                current = span
            }
        }
        if let open = current { seconds += open.end.timeIntervalSince(open.start) }
        return seconds / 3600
    }

    // MARK: - Workouts

    private func workoutRows(from startDate: Date, to endDate: Date) async throws -> [[String: Any]] {
        var seen = Set<String>()
        var rows: [[String: Any]] = []
        for window in Self.windows(from: startDate, to: endDate) {
            for row in try await workoutRowsIn(from: window.start, to: window.end) {
                // The windows overlap by a day, so a workout near a seam is
                // read twice. Its uuid is stable, so keep the first.
                guard let id = row["id"] as? String, seen.insert(id).inserted else { continue }
                rows.append(row)
            }
        }
        return rows
    }

    private func workoutRowsIn(from startDate: Date, to endDate: Date) async throws -> [[String: Any]] {
        let datePredicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate)
        let descriptor = HKSampleQueryDescriptor(
            predicates: [HKSamplePredicate.workout(datePredicate)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        let workouts = try await descriptor.result(for: store)
        let bpm = HKUnit.count().unitDivided(by: .minute())

        return workouts.map { workout in
            var row: [String: Any] = [
                "id": workout.uuid.uuidString,
                "name": Self.name(for: workout.workoutActivityType),
                "start": Payload.date(workout.startDate),
                "end": Payload.date(workout.endDate),
                "duration": workout.duration,
            ]
            if let energy = workout.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity() {
                row["activeEnergyBurned"] = ["qty": energy.doubleValue(for: .kilocalorie()), "units": "kcal"]
            }
            let distance = workout.statistics(for: HKQuantityType(.distanceWalkingRunning))?.sumQuantity()
                ?? workout.statistics(for: HKQuantityType(.distanceCycling))?.sumQuantity()
            if let distance {
                row["distance"] = ["qty": distance.doubleValue(for: .meterUnit(with: .kilo)), "units": "km"]
            }
            if let hr = workout.statistics(for: HKQuantityType(.heartRate)) {
                var heartRate: [String: Any] = [:]
                if let v = hr.averageQuantity() { heartRate["avg"] = v.doubleValue(for: bpm) }
                if let v = hr.maximumQuantity() { heartRate["max"] = v.doubleValue(for: bpm) }
                if let v = hr.minimumQuantity() { heartRate["min"] = v.doubleValue(for: bpm) }
                if !heartRate.isEmpty { row["heartRate"] = heartRate }
            }
            return row
        }
    }

    private static func name(for type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: return "Outdoor Run"
        case .walking: return "Walking"
        case .cycling: return "Cycling"
        case .swimming: return "Swimming"
        case .traditionalStrengthTraining: return "Traditional Strength Training"
        case .functionalStrengthTraining: return "Functional Strength Training"
        case .highIntensityIntervalTraining: return "HIIT"
        case .yoga: return "Yoga"
        case .hiking: return "Hiking"
        case .elliptical: return "Elliptical"
        case .rowing: return "Rowing"
        case .soccer: return "Football"
        case .tennis: return "Tennis"
        case .coreTraining: return "Core Training"
        default: return "Workout"
        }
    }
}

/// File scope on purpose: it is used inside the escaping statistics closures,
/// where an instance method would drag `self` in for no reason.
private func round2(_ v: Double) -> Double { (v * 100).rounded() / 100 }
