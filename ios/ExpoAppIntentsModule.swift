import AppIntents
import ExpoModulesCore
import Foundation

protocol AnyIntentParameter {
    var anyWrappedValue: Any? { get }
}

@available(iOS 16.0, *)
extension IntentParameter: AnyIntentParameter {
    var anyWrappedValue: Any? {
        return self.wrappedValue
    }
}

public func anyToDictionary(parent: Any) -> [String: Any] {
    return Mirror(reflecting: parent).children.reduce(into: [:]) { dict, child in
        if let label = child.label {
            dict[label] = (child.value as? AnyIntentParameter)?.anyWrappedValue
        }
    }
}

public class ExpoAppIntentsModule: Module {

    private static var currentInstance: ExpoAppIntentsModule?

    public static func shared() -> ExpoAppIntentsModule? {
        return currentInstance
    }

    private var openIntents: [String: CheckedContinuation<[String: Any], Error>] = [:]

    public func definition() -> ModuleDefinition {

        Name("ExpoAppIntents")

        OnCreate {
            Self.currentInstance = self
        }

        Events("onIntent")

        Function("completeIntent") { (id: String, result: [String: Any]) -> Bool in
            guard let intent = openIntents.removeValue(forKey: id) else {
                return false
            }
            intent.resume(returning: result)
            return true
        }

        Function("failIntent") { (id: String, result: [String: Any]) -> Bool in
            guard let intent = openIntents.removeValue(forKey: id) else {
                return false
            }
            openIntents.removeValue(forKey: id)
            intent.resume(
                throwing: GenericException<String>(result["error"] as? String ?? "Unknown error"))
            return true
        }

    }

    public func postNotificationAndWait(name: String, parameters: [String: Any])
        async throws -> [String: Any]
    {
        let key = UUID().uuidString
        return try await withCheckedThrowingContinuation { continuation in
            openIntents[key] = continuation
            sendEvent(
                "onIntent",
                [
                    "name": name,
                    "id": key,
                    "parameters": parameters,
                ])
        }
    }
}
