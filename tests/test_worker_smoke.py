def test_worker_settings_shape():
    from worker.worker import WorkerSettings, noop

    assert WorkerSettings.functions == [noop]
    assert WorkerSettings.cron_jobs == []
    assert WorkerSettings.redis_settings is not None
