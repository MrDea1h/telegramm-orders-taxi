def test_start_handler_registered():
    from bot.bot import cmd_start, router

    handlers = [obs.callback for obs in router.message.handlers]
    assert cmd_start in handlers
