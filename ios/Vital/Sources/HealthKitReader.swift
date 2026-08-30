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
        let averaged: [(HKQuantityTypeIdentifier, String, String, HKUnit)] = [
            (.heartRateVariabilitySDNN, "heart_rate_variability", "ms", HKUnit.secondUnit(with: .milli)),
            (.restingHeartRate, "resting_heart_rate", "count/min", HKUnit.count().unitDivided(by: .minute())),
            (.respiratoryRate, "respiratory_rate", "count/min", HKUnit.count().unitDivided(by: .minute())),
            (.oxygenSaturation, "blood_oxygen_saturation", "%", HKUnit.percent()),
            (.vo2Max, "vo2_max", "mL/kg/min",
             HKUnit.literUnit(with: .milli).unitDivided(by: HKUnit.gramUnit(with: .kilo).unitMultiplied(by: .minute()))),
        ]
        for (identifier, name, units, unit) in averaged {
            let rows = try await dailyStats(identifier, .discreteAverage, unit, from: startDate, to: endDate) { stats in
                stats.averageQuantity().map { ["qty": $0.doubleValue(for: unit)] }
            }
            if !rows.isEmpty { metrics.append(Payload.metric(name: name, units: units, rows: rows)) }
        }

        // Daily sums (count-style metrics).
        let summed: [(HKQuantityTypeIdentifier, String, String, HKUnit)] = [
            (.activeEnergyBurned, "active_energy", "kcal", HKUnit.kilocalorie()),
            (.stepCount, "step_count", "steps", HKUnit.count()),
        ]
        for (identifier, name, units, unit) in summed {
            let rows = try await dailyStats(identifier, .cumulativeSum, unit, from: startDate, to: endDate) { stats in
                stats.sumQuantity().map { ["qty": $0.doubleValue(for: unit)] }
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

    // MARK: - Sleep

    private func sleepMetric(from startDate: Date, to endDate: Date) async throws -> [String: Any]? {
        let type = HKCategoryType(.sleepAnalysis)
        let datePredicate = HKQuery.predicateForSamples(withStart: startDate, end: endDate)
        let descriptor = HKSampleQueryDescriptor(
            predicates: [HKSamplePredicate.categorySample(type: type, predicate: datePredicate)],
            sortDescriptors: [SortDescriptor(\.startDate)]
        )
        let samples = try await descriptor.result(for: store)
        guard !samples.isEmpty else { return nil }

        struct Night {
            var core = 0.0, deep = 0.0, rem = 0.0, unspecified = 0.0, awake = 0.0, inBed = 0.0
            var start: Date?, end: Date?
        }
        var nights: [String: Night] = [:] // key: wake-day "yyyy-MM-dd"
        let dayKey: DateFormatter = {
            let f = DateFormatter()
            f.dateFormat = "yyyy-MM-dd"
            f.locale = Locale(identifier: "en_US_POSIX")
            return f
        }()

        for sample in samples {
            let hours = sample.endDate.timeIntervalSince(sample.startDate) / 3600
            let key = dayKey.string(from: sample.endDate)
            var night = nights[key] ?? Night()
            switch HKCategoryValueSleepAnalysis(rawValue: sample.value) {
            case .asleepCore: night.core += hours
            case .asleepDeep: night.deep += hours
            case .asleepREM: night.rem += hours
            case .asleepUnspecified: night.unspecified += hours
            case .awake: night.awake += hours
            case .inBed: night.inBed += hours
            default: break
            }
            if night.start == nil || sample.startDate < night.start! { night.start = sample.startDate }
            if night.end == nil || sample.endDate > night.end! { night.end = sample.endDate }
            nights[key] = night
        }

        var rows: [[String: Any]] = []
        let tzSuffix = String(Payload.dateFormatter.string(from: Date()).suffix(5))
        for (key, night) in nights.sorted(by: { $0.key < $1.key }) {
            let total = night.core + night.deep + night.rem + night.unspecified
            guard total > 0 || night.inBed > 0 else { continue }
            var row: [String: Any] = [
                "date": "\(key) 12:00:00 \(tzSuffix)",
                "totalSleep": round2(total),
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
        guard !rows.isEmpty else { return nil }
        return Payload.metric(name: "sleep_analysis", units: "hr", rows: rows)
    }

    // MARK: - Workouts

    private func workoutRows(from startDate: Date, to endDate: Date) async throws -> [[String: Any]] {
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

    private func round2(_ v: Double) -> Double { (v * 100).rounded() / 100 }
}
