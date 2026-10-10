// Every test talks to Steam through the downloader's static session, so they run one at a time.
[assembly: CollectionBehavior(DisableTestParallelization = true)]
