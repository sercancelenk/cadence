using System.Security;
using System.Text.Json;
using Windows.Data.Xml.Dom;
using Windows.UI.Notifications;

const string DefaultAppId = "com.cadence.app";
const string IdPrefix = "cadence:";

string AppId() => Environment.GetEnvironmentVariable("CADENCE_AUMID") ?? DefaultAppId;

void PrintJson(object obj)
{
    Console.WriteLine(JsonSerializer.Serialize(obj));
}

void Respond(object? reqId, bool ok, object? extra = null)
{
    var dict = new Dictionary<string, object?> { ["ok"] = ok };
    if (reqId != null) dict["_reqId"] = reqId;
    if (extra is Dictionary<string, object?> extraDict)
    {
        foreach (var kv in extraDict) dict[kv.Key] = kv.Value;
    }
    PrintJson(dict);
}

string EscapeXml(string value) => SecurityElement.Escape(value) ?? string.Empty;

string LaunchUrl(string? itemId, string? source)
{
    var id = itemId ?? string.Empty;
    if (string.IsNullOrEmpty(id)) return "cadence://";
    return source == "team-item" ? $"cadence://item/{id}" : $"cadence://todo/{id}";
}

ToastNotifier Notifier() => ToastNotificationManager.CreateToastNotifier(AppId());

void RequestPermission()
{
    Respond(null, true, new Dictionary<string, object?> { ["granted"] = true, ["error"] = null });
}

void ListPending()
{
    var ids = new List<string>();
    try
    {
        var collection = ToastNotificationManager.GetFutureScheduledToastNotificationsCollection();
        foreach (var toast in collection)
        {
            if (toast.Id.StartsWith(IdPrefix, StringComparison.Ordinal)) ids.Add(toast.Id);
        }
    }
    catch (Exception ex)
    {
        Respond(null, false, new Dictionary<string, object?> { ["error"] = ex.Message });
        return;
    }
    Respond(null, true, new Dictionary<string, object?> { ["ids"] = ids });
}

void ListDelivered()
{
    var ids = new List<string>();
    try
    {
        var history = ToastNotificationManager.History.GetHistory(AppId());
        foreach (var toast in history)
        {
            if (toast.Id.StartsWith(IdPrefix, StringComparison.Ordinal)) ids.Add(toast.Id);
        }
    }
    catch (Exception ex)
    {
        Respond(null, false, new Dictionary<string, object?> { ["error"] = ex.Message });
        return;
    }
    Respond(null, true, new Dictionary<string, object?> { ["ids"] = ids });
}

void Cancel(string id)
{
    try
    {
        Notifier().RemoveFromSchedule(id);
        ToastNotificationManager.History.Remove(id);
    }
    catch
    {
        /* ignore missing */
    }
    Respond(null, true);
}

void CancelPrefix(string prefix)
{
    try
    {
        var collection = ToastNotificationManager.GetFutureScheduledToastNotificationsCollection();
        foreach (var toast in collection)
        {
            if (toast.Id.StartsWith(prefix, StringComparison.Ordinal))
            {
                Notifier().RemoveFromSchedule(toast.Id);
            }
        }
        var history = ToastNotificationManager.History.GetHistory(AppId());
        foreach (var toast in history)
        {
            if (toast.Id.StartsWith(prefix, StringComparison.Ordinal))
            {
                ToastNotificationManager.History.Remove(toast.Id);
            }
        }
    }
    catch (Exception ex)
    {
        Respond(null, false, new Dictionary<string, object?> { ["error"] = ex.Message });
        return;
    }
    Respond(null, true, new Dictionary<string, object?> { ["removedPrefix"] = prefix });
}

void Schedule(string json)
{
    SchedulePayload? payload;
    try
    {
        payload = JsonSerializer.Deserialize<SchedulePayload>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
        });
    }
    catch
    {
        Respond(null, false, new Dictionary<string, object?> { ["error"] = "invalid-json" });
        return;
    }

    if (payload == null || string.IsNullOrWhiteSpace(payload.Id))
    {
        Respond(null, false, new Dictionary<string, object?> { ["error"] = "invalid-json" });
        return;
    }

    var fireAt = DateTimeOffset.FromUnixTimeMilliseconds((long)payload.FireAtMs);
    if (fireAt <= DateTimeOffset.UtcNow.AddSeconds(1))
    {
        Respond(null, false, new Dictionary<string, object?> { ["error"] = "fire-time-in-past" });
        return;
    }

    var launch = LaunchUrl(payload.ItemId, payload.Source);
    var xml = $"""
<toast launch="{EscapeXml(launch)}">
  <visual>
    <binding template="ToastGeneric">
      <text>{EscapeXml(payload.Title ?? "Reminder")}</text>
      <text>{EscapeXml(payload.Body ?? string.Empty)}</text>
    </binding>
  </visual>
</toast>
""";

    try
    {
        var doc = new XmlDocument();
        doc.LoadXml(xml);
        var scheduled = new ScheduledToastNotification(doc, fireAt.UtcDateTime) { Id = payload.Id };
        Notifier().AddToSchedule(scheduled);
        Respond(null, true, new Dictionary<string, object?>
        {
            ["id"] = payload.Id,
            ["fireAtMs"] = payload.FireAtMs,
        });
    }
    catch (Exception ex)
    {
        Respond(null, false, new Dictionary<string, object?> { ["error"] = ex.Message });
    }
}

if (args.Length < 1)
{
    PrintJson(new { ok = false, error = "usage" });
    return 1;
}

switch (args[0])
{
    case "request-permission":
        RequestPermission();
        break;
    case "list":
        ListPending();
        break;
    case "list-delivered":
        ListDelivered();
        break;
    case "cancel":
        if (args.Length < 2)
        {
            Respond(null, false, new Dictionary<string, object?> { ["error"] = "missing-id" });
            break;
        }
        Cancel(args[1]);
        break;
    case "cancel-prefix":
        if (args.Length < 2)
        {
            Respond(null, false, new Dictionary<string, object?> { ["error"] = "missing-prefix" });
            break;
        }
        CancelPrefix(args[1]);
        break;
    case "schedule":
        if (args.Length < 2)
        {
            Respond(null, false, new Dictionary<string, object?> { ["error"] = "missing-payload" });
            break;
        }
        Schedule(args[1]);
        break;
    default:
        Respond(null, false, new Dictionary<string, object?> { ["error"] = "unknown-command" });
        break;
}

return 0;

sealed class SchedulePayload
{
    public string Id { get; set; } = string.Empty;
    public double FireAtMs { get; set; }
    public string? Title { get; set; }
    public string? Body { get; set; }
    public string? ItemId { get; set; }
    public string? Source { get; set; }
}
