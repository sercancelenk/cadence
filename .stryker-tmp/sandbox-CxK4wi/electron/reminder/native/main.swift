import AppKit
import Foundation
import UserNotifications

struct SchedulePayload: Decodable {
  let id: String
  let fireAtMs: Double
  let title: String
  let body: String
  let itemId: String?
  let source: String?
}

let center = UNUserNotificationCenter.current()

func waitFor(_ work: (@escaping () -> Void) -> Void) {
  let sem = DispatchSemaphore(value: 0)
  work { sem.signal() }
  sem.wait()
}

func printJson(_ obj: [String: Any]) {
  let data = try! JSONSerialization.data(withJSONObject: obj, options: [])
  if let line = String(data: data, encoding: .utf8) {
    print(line)
    fflush(stdout)
  }
}

func respond(reqId: Any?, ok: Bool, extra: [String: Any] = [:]) {
  var obj: [String: Any] = ["ok": ok]
  if let reqId { obj["_reqId"] = reqId }
  for (k, v) in extra { obj[k] = v }
  printJson(obj)
}

func requestPermission(reqId: Any? = nil) {
  waitFor { done in
    center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
      respond(
        reqId: reqId,
        ok: true,
        extra: [
          "granted": granted,
          "error": error?.localizedDescription as Any,
        ]
      )
      done()
    }
  }
}

func listPending(reqId: Any? = nil) {
  waitFor { done in
    center.getPendingNotificationRequests { requests in
      let ids = requests.map(\.identifier).filter { $0.hasPrefix("cadence:") }
      respond(reqId: reqId, ok: true, extra: ["ids": ids])
      done()
    }
  }
}

func listDelivered(reqId: Any? = nil) {
  waitFor { done in
    center.getDeliveredNotifications { notifications in
      let ids = notifications.map { $0.request.identifier }.filter { $0.hasPrefix("cadence:") }
      respond(reqId: reqId, ok: true, extra: ["ids": ids])
      done()
    }
  }
}

func cancel(id: String, reqId: Any? = nil) {
  center.removePendingNotificationRequests(withIdentifiers: [id])
  center.removeDeliveredNotifications(withIdentifiers: [id])
  respond(reqId: reqId, ok: true)
}

func cancelPrefix(_ prefix: String, reqId: Any? = nil) {
  waitFor { done in
    center.getPendingNotificationRequests { requests in
      let pending = requests.map(\.identifier).filter { $0.hasPrefix(prefix) }
      if !pending.isEmpty {
        center.removePendingNotificationRequests(withIdentifiers: pending)
      }
      done()
    }
  }
  waitFor { done in
    center.getDeliveredNotifications { notifications in
      let delivered = notifications.map { $0.request.identifier }.filter { $0.hasPrefix(prefix) }
      if !delivered.isEmpty {
        center.removeDeliveredNotifications(withIdentifiers: delivered)
      }
      done()
    }
  }
  respond(reqId: reqId, ok: true, extra: ["removedPrefix": prefix])
}

func schedulePayload(_ payload: SchedulePayload, reqId: Any? = nil) {
  let fireDate = Date(timeIntervalSince1970: payload.fireAtMs / 1000.0)
  if fireDate.timeIntervalSinceNow < 1 {
    respond(reqId: reqId, ok: false, extra: ["error": "fire-time-in-past"])
    return
  }

  let content = UNMutableNotificationContent()
  content.title = payload.title
  content.body = payload.body
  content.sound = .default
  let itemId = payload.itemId ?? ""
  let source = payload.source ?? "todo"
  content.userInfo = [
    "cadenceSlotId": payload.id,
    "itemId": itemId,
    "source": source,
  ]

  let components = Calendar.current.dateComponents(
    [.year, .month, .day, .hour, .minute, .second],
    from: fireDate
  )
  let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
  let request = UNNotificationRequest(identifier: payload.id, content: content, trigger: trigger)

  waitFor { done in
    center.removePendingNotificationRequests(withIdentifiers: [payload.id])
    center.add(request) { error in
      if let error {
        respond(reqId: reqId, ok: false, extra: ["error": error.localizedDescription])
      } else {
        respond(reqId: reqId, ok: true, extra: ["id": payload.id, "fireAtMs": payload.fireAtMs])
      }
      done()
    }
  }
}

func schedule(json: String, reqId: Any? = nil) {
  guard let data = json.data(using: .utf8),
        let payload = try? JSONDecoder().decode(SchedulePayload.self, from: data) else {
    respond(reqId: reqId, ok: false, extra: ["error": "invalid-json"])
    return
  }
  schedulePayload(payload, reqId: reqId)
}

final class NotifyDelegate: NSObject, UNUserNotificationCenterDelegate {
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let info = response.notification.request.content.userInfo
    let itemId = info["itemId"] as? String ?? ""
    let source = info["source"] as? String ?? "todo"
    if !itemId.isEmpty {
      let kind = (source == "team-item") ? "item" : "todo"
      printJson(["event": "click", "url": "cadence://\(kind)/\(itemId)"])
    }
    completionHandler()
  }
}

func handleAgentCommand(_ obj: [String: Any]) {
  guard let cmd = obj["cmd"] as? String else {
    respond(reqId: obj["_reqId"], ok: false, extra: ["error": "missing-cmd"])
    return
  }
  let reqId = obj["_reqId"]

  switch cmd {
  case "request-permission":
    requestPermission(reqId: reqId)
  case "list":
    listPending(reqId: reqId)
  case "list-delivered":
    listDelivered(reqId: reqId)
  case "cancel":
    guard let id = obj["id"] as? String else {
      respond(reqId: reqId, ok: false, extra: ["error": "missing-id"])
      return
    }
    cancel(id: id, reqId: reqId)
  case "cancel-prefix":
    guard let prefix = obj["prefix"] as? String else {
      respond(reqId: reqId, ok: false, extra: ["error": "missing-prefix"])
      return
    }
    cancelPrefix(prefix, reqId: reqId)
  case "schedule":
    if let json = obj["json"] as? String {
      schedule(json: json, reqId: reqId)
      return
    }
    guard
      let id = obj["id"] as? String,
      let fireAtMs = obj["fireAtMs"] as? Double,
      let title = obj["title"] as? String,
      let body = obj["body"] as? String
    else {
      respond(reqId: reqId, ok: false, extra: ["error": "missing-schedule-fields"])
      return
    }
    let payload = SchedulePayload(
      id: id,
      fireAtMs: fireAtMs,
      title: title,
      body: body,
      itemId: obj["itemId"] as? String,
      source: obj["source"] as? String
    )
    schedulePayload(payload, reqId: reqId)
  default:
    respond(reqId: reqId, ok: false, extra: ["error": "unknown-command"])
  }
}

func runAgent() {
  let delegate = NotifyDelegate()
  UNUserNotificationCenter.current().delegate = delegate

  DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine(strippingNewline: true) {
      guard
        let data = line.data(using: .utf8),
        let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
      else {
        respond(reqId: nil, ok: false, extra: ["error": "bad-json"])
        continue
      }
      handleAgentCommand(obj)
    }
    DispatchQueue.main.async {
      NSApp.terminate(nil)
    }
  }

  let app = NSApplication.shared
  app.setActivationPolicy(.accessory)
  app.run()
}

let args = CommandLine.arguments
guard args.count >= 2 else {
  fputs("usage: cadence-notify-schedule <command>\n", stderr)
  exit(1)
}

switch args[1] {
case "agent":
  runAgent()
case "request-permission":
  requestPermission()
case "list":
  listPending()
case "list-delivered":
  listDelivered()
case "cancel":
  guard args.count >= 3 else {
    printJson(["ok": false, "error": "missing-id"])
    break
  }
  cancel(id: args[2])
case "cancel-prefix":
  guard args.count >= 3 else {
    printJson(["ok": false, "error": "missing-prefix"])
    break
  }
  cancelPrefix(args[2])
case "schedule":
  guard args.count >= 3 else {
    printJson(["ok": false, "error": "missing-payload"])
    break
  }
  schedule(json: args[2])
default:
  printJson(["ok": false, "error": "unknown-command"])
}
