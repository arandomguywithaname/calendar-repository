import Foundation
import HealthKit

/// Reads the last N days of Apple Health data and shapes it into the
/// server's ingest payload. Read-only: Vital never writes to Health.
final class HealthKitReader {

    let store = HKHealthStore()

    /// One daily-aggregated metric: where it comes from, what the server calls
    /// it, and how to turn the quantity into a number.
    private struct Daily {
        let id: HKQuantityTypeIdentifier
        let name: String
        let units: String
        let unit: HKUnit
        /// HealthKit reports some fractions as 0–1 where the server's contract
        /// uses percent — blood oxygen arrives as 0.975, not 97.5.
        var scale: Double = 1
        /// Counted things come back as floats often enough to matter:
        /// 11623.858733 reads back to a person as "11,623.86 steps".
        var whole: Bool = false
    }

    private static let vo2Unit = HKUnit.literUnit(with: .milli)
        .unitDivided(by: HKUnit.gramUnit(with: .kilo).unitMultiplied(by: .minute()))

    /// Effort in METs: kilocalories per kilogram per hour.
    private static let effortUnit = HKUnit.kilocalorie()
        .unitDivided(by: HKUnit.gramUnit(with: .kilo).unitMultiplied(by: .hour()))

    /// Metrics whose daily figure is an average of that day's readings.
    ///
    /// Everything here is a *discrete* HealthKit type. Asking for a cumulative
    /// sum of one of these throws, so the split between this table and the next
    /// is not cosmetic — check the type's aggregation style before adding a row.
    private var averagedMetrics: [Daily] {
        let bpm = HKUnit.count().unitDivided(by: .minute())
        let kg = HKUnit.gramUnit(with: .kilo)
        let cm = HKUnit.meterUnit(with: .centi)
        var list: [Daily] = [
            Daily(id: .restingHeartRate, name: "resting_heart_rate", units: "count/min", unit: bpm),
            Daily(id: .respiratoryRate, name: "respiratory_rate", units: "count/min", unit: bpm),
            Daily(id: .oxygenSaturation, name: "blood_oxygen_saturation", units: "%", unit: .percent(), scale: 100),
            Daily(id: .vo2Max, name: "vo2_max", units: "mL/kg/min", unit: Self.vo2Unit),

            // Body composition. A scale or a hand-entered figure, so most days
            // hold nothing and only the days with a reading produce a row.
            Daily(id: .bodyMass, name: "body_mass", units: "kg", unit: kg),
            Daily(id: .leanBodyMass, name: "lean_body_mass", units: "kg", unit: kg),
            Daily(id: .bodyFatPercentage, name: "body_fat_percentage", units: "%", unit: .percent(), scale: 100),
            Daily(id: .bodyMassIndex, name: "body_mass_index", units: "count", unit: .count()),
            Daily(id: .waistCircumference, name: "waist_circumference", units: "cm", unit: cm),
            Daily(id: .height, name: "height", units: "cm", unit: cm),

            // Cardio and recovery.
            Daily(id: .walkingHeartRateAverage, name: "walking_heart_rate_average", units: "count/min", unit: bpm),
            Daily(id: .heartRateRecoveryOneMinute, name: "heart_rate_recovery_one_minute", units: "count/min", unit: bpm),

            // Running form — written by the watch during outdoor runs only.
            Daily(id: .runningSpeed, name: "running_speed", units: "m/s", unit: HKUnit.meter().unitDivided(by: .second())),
            Daily(id: .runningPower, name: "running_power", units: "W", unit: .watt()),
            Daily(id: .runningStrideLength, name: "running_stride_length", units: "m", unit: .meter()),
            Daily(id: .runningGroundContactTime, name: "running_ground_contact_time", units: "ms",
                  unit: HKUnit.secondUnit(with: .milli)),
            Daily(id: .runningVerticalOscillation, name: "running_vertical_oscillation", units: "cm", unit: cm),

            // Overnight wrist temperature: the server already understands this
            // name and files it as the day's wristTemperatureC.
            Daily(id: .appleSleepingWristTemperature, name: "apple_sleeping_wrist_temperature",
                  units: "degC", unit: .degreeCelsius()),
        ]
        if #available(iOS 17.0, *) {
            list.append(Daily(id: .physicalEffort, name: "physical_effort", units: "kcal/hr*kg", unit: Self.effortUnit))
        }
        return list
    }

    /// Metrics whose daily figure is the sum of that day's readings. All
    /// cumulative types — see the note above before adding one.
    private var summedMetrics: [Daily] {
        let km = HKUnit.meterUnit(with: .kilo)
        var list: [Daily] = [
            Daily(id: .activeEnergyBurned, name: "active_energy", units: "kcal", unit: .kilocalorie()),
            Daily(id: .basalEnergyBurned, name: "basal_energy_burned", units: "kcal", unit: .kilocalorie()),
            Daily(id: .stepCount, name: "step_count", units: "steps", unit: .count(), whole: true),
            Daily(id: .flightsClimbed, name: "flights_climbed", units: "count", unit: .count(), whole: true),
            // Distance was already asked for and used inside workouts, but never
            // reported as a day of its own.
            Daily(id: .distanceWalkingRunning, name: "walking_running_distance", units: "km", unit: km),
            Daily(id: .distanceCycling, name: "cycling_distance", units: "km", unit: km),
            Daily(id: .appleExerciseTime, name: "apple_exercise_time", units: "min", unit: .minute(), whole: true),
            Daily(id: .appleStandTime, name: "apple_stand_time", units: "min", unit: .minute(), whole: true),
        ]
        if #available(iOS 17.0, *) {
            list.append(Daily(id: .timeInDaylight, name: "time_in_daylight", units: "min", unit: .minute(), whole: true))
        }
        return list
    }

    /// Everything Vital asks permission for — the phone shows each one
    /// separately and dad approves them one by one (project rule #1).
    ///
    /// Derived from the tables above rather than listed again, because a metric
    /// added to a table but missing here would not error: HealthKit answers an
    /// unauthorized read with no samples and no error, so the metric would
    /// simply never appear and nothing would say why.
    private var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [
            HKQuantityType(.heartRate),
            HKQuantityType(.heartRateVariabilitySDNN),
            HKObjectType.workoutType(),
        ]
        for metric in averagedMetrics + summedMetrics {
            types.insert(HKQuantityType(metric.id))
        }
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

        // Daily averages (gauge-style metrics), then daily sums (count-style).
        //
        // No source is attached to either: these come from
        // HKStatisticsCollectionQuery, which is the API that de-duplicates a
        // phone and a watch both recording the same day. That is exactly what
        // stops steps being counted twice, and the price of it is that the
        // answer belongs to no single device. Where Vital does pick a device on
        // purpose — HRV and sleep, below — it says which one it picked.
        for metric in averagedMetrics {
            // Asking a cumulative type for a discrete average raises an
            // Objective-C exception, which Swift cannot catch: the app would
            // die on the spot, looking to the person exactly like the memory
            // kill fixed earlier. A wrongly classified metric should go missing
            // instead, so check what HealthKit says the type is.
            guard HKQuantityType(metric.id).aggregationStyle != .cumulative else { continue }
            let unit = metric.unit
            let scale = metric.scale
            let rows = try await dailyStats(metric.id, .discreteAverage, unit, from: startDate, to: endDate) { stats in
                stats.averageQuantity().map { ["qty": round2($0.doubleValue(for: unit) * scale)] }
            }
            if !rows.isEmpty {
                metrics.append(Payload.metric(name: metric.name, units: metric.units, rows: rows))
            }
        }

        for metric in summedMetrics {
            // Same guard, the other way round.
            guard HKQuantityType(metric.id).aggregationStyle == .cumulative else { continue }
            let unit = metric.unit
            let whole = metric.whole
            let rows = try await dailyStats(metric.id, .cumulativeSum, unit, from: startDate, to: endDate) { stats in
                stats.sumQuantity().map { q in
                    let v = q.doubleValue(for: unit)
                    return ["qty": whole ? v.rounded() : (v * 10).rounded() / 10]
                }
            }
            if !rows.isEmpty {
                metrics.append(Payload.metric(name: metric.name, units: metric.units, rows: rows))
            }
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
            metrics.append(Payload.metric(name: "heart_rate_variability", units: "ms", rows: hrv,
                                          source: Self.commonSource(hrv)))
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
            guard let best = devices.max(by: { $0.value.count < $1.value.count }),
                  !best.value.isEmpty else { continue }
            var row: [String: Any] = [
                "date": "\(key) 12:00:00 \(tzSuffix)",
                "qty": round2(median(best.value)),
                "source": best.key,
            ]
            // Say so when something else was also recording that night: a
            // number that silently dropped a second device reads the same as
            // one that never had a choice to make.
            if devices.count > 1 { row["sources"] = devices.keys.sorted() }
            rows.append(row)
        }
        return rows
    }

    /// The one source behind every row, when they agree — otherwise nil,
    /// because a window covering two devices has no single answer.
    private static func commonSource(_ rows: [[String: Any]]) -> String? {
        let sources = Set(rows.compactMap { $0["source"] as? String })
        return sources.count == 1 ? sources.first : nil
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
        return Payload.metric(name: "sleep_analysis", units: "hr", rows: merged,
                              source: Self.commonSource(merged))
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
            let candidates = bySource.map { (source: $0.key, night: nightTotals($0.value)) }
            guard let best = candidates.max(by: { a, b in
                if a.night.staged != b.night.staged { return b.night.staged }
                return a.night.asleep < b.night.asleep
            }) else { continue }
            let night = best.night
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
            // Which device this night is, and what else was recording it. The
            // choice was already being made here; it was just never reported,
            // so a night where the phone won and the watch lost looked exactly
            // like a night with only one device in the room.
            row["source"] = best.source
            if bySource.count > 1 { row["sources"] = bySource.keys.sorted() }
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
