// Reads the branches and depot manifests of Steam apps from their public app info, signed in anonymously.
// Usage: SteamAppInfo <apps.json: [{ "gameId", "appId" }]> <out.json>
using System.Text.Json;
using System.Text.Json.Nodes;
using SteamKit2;

if (args.Length != 2)
{
    Console.Error.WriteLine("Usage: SteamAppInfo <apps.json> <out.json>");
    return 2;
}

var apps = JsonNode.Parse(File.ReadAllText(args[0]))!.AsArray()
    .Select(node => (gameId: node!["gameId"]!.GetValue<string>(), appId: node!["appId"]!.GetValue<uint>()))
    .ToList();

var client = new SteamClient();
var manager = new CallbackManager(client);
var user = client.GetHandler<SteamUser>()!;
var steamApps = client.GetHandler<SteamApps>()!;
var loggedOn = new TaskCompletionSource<EResult>();

manager.Subscribe<SteamClient.ConnectedCallback>(_ => user.LogOnAnonymous());
manager.Subscribe<SteamClient.DisconnectedCallback>(_ => loggedOn.TrySetException(new Exception("Steam disconnected")));
manager.Subscribe<SteamUser.LoggedOnCallback>(callback => loggedOn.TrySetResult(callback.Result));

using var stop = new CancellationTokenSource();
var pump = Task.Run(() =>
{
    while (!stop.IsCancellationRequested)
    {
        manager.RunWaitCallbacks(TimeSpan.FromMilliseconds(200));
    }
});

client.Connect();
var logOn = await loggedOn.Task.WaitAsync(TimeSpan.FromSeconds(30));
if (logOn != EResult.OK)
{
    throw new Exception($"Anonymous sign-in failed: {logOn}");
}

var appIds = apps.Select(app => app.appId).Distinct().ToList();
var tokens = await steamApps.PICSGetAccessTokens(appIds, []).ToTask();
var requests = appIds.Select(appId => new SteamApps.PICSRequest(appId, tokens.AppTokens.GetValueOrDefault(appId))).ToList();
var infoSet = await steamApps.PICSGetProductInfo(requests, []).ToTask();

var infoByAppId = new Dictionary<uint, KeyValue>();
foreach (var callback in infoSet.Results!)
{
    foreach (var (appId, info) in callback.Apps)
    {
        infoByAppId[appId] = info.KeyValues;
    }
}

var result = new JsonArray();
foreach (var (gameId, appId) in apps)
{
    var entry = new JsonObject { ["gameId"] = gameId, ["appId"] = appId };
    if (!infoByAppId.TryGetValue(appId, out var info))
    {
        entry["error"] = tokens.AppTokensDenied.Contains(appId) ? "token denied" : "no app info";
        result.Add(entry);
        continue;
    }

    var branches = new JsonObject();
    foreach (var branch in info["depots"]["branches"].Children)
    {
        branches[branch.Name!] = new JsonObject
        {
            ["buildId"] = branch["buildid"].Value,
            ["description"] = branch["description"].Value,
            ["passwordRequired"] = branch["pwdrequired"].Value == "1",
        };
    }
    entry["branches"] = branches;

    var depots = new JsonObject();
    foreach (var depot in info["depots"].Children.Where(depot => uint.TryParse(depot.Name, out _)))
    {
        var manifests = new JsonObject();
        foreach (var manifest in depot["manifests"].Children)
        {
            // Steam sends a manifest as { gid, size, download }, older app info as the bare gid.
            manifests[manifest.Name!] = manifest["gid"].Value ?? manifest.Value;
        }
        depots[depot.Name!] = new JsonObject
        {
            ["manifests"] = manifests,
            ["encryptedManifests"] = new JsonArray(depot["encryptedmanifests"].Children.Select(m => (JsonNode?)m.Name).ToArray()),
        };
    }
    entry["depots"] = depots;
    result.Add(entry);
}

File.WriteAllText(args[1], result.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine($"Read app info for {infoByAppId.Count} of {appIds.Count} apps");

stop.Cancel();
client.Disconnect();
await pump;
return 0;
