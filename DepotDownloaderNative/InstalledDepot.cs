namespace DepotDownloaderNative
{
  /// <summary>An installed depot and its manifest id, as a decimal string so 64-bit ids survive JavaScript.</summary>
  public class InstalledDepot(uint depotId, string manifestId)
  {
    public uint DepotId { get; } = depotId;
    public string ManifestId { get; } = manifestId;
  }
}
