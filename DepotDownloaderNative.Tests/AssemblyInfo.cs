// The downloader keeps its configuration in statics and tests redirect the process console,
// so tests in different classes must not run concurrently.
[assembly: CollectionBehavior(DisableTestParallelization = true)]
