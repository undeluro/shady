"""Local structured diagnostics. Never pass user input or geometry to event()."""

import json
import logging
import os
import re
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from traceback import extract_tb
from uuid import uuid4

request_id = ContextVar("request_id", default=None)
logger = logging.getLogger("shady")


def new_request_id(supplied=None):
    return supplied if supplied and re.fullmatch(r"[a-zA-Z0-9_-]{1,64}", supplied) else uuid4().hex


def configure_logging(default_file):
    logger.setLevel(os.getenv("SHADY_LOG_LEVEL", "INFO").upper())
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
        handler.close()
    console = logging.StreamHandler(sys.stderr)
    logger.addHandler(console)
    filename = os.getenv("SHADY_LOG_FILE", str(default_file))
    if filename:
        path = Path(filename)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            logger.addHandler(RotatingFileHandler(path, maxBytes=5 * 1024 * 1024, backupCount=3))
        except OSError as error:
            event("logging.file_unavailable", level="WARNING", error_type=type(error).__name__)


def event(name, *, level="INFO", **fields):
    logger.log(
        getattr(logging, level),
        json.dumps(
            {
                "timestamp": datetime.now(UTC).isoformat(),
                "level": level,
                "component": "backend",
                "event": name,
                "request_id": request_id.get(),
                **fields,
            },
            ensure_ascii=False,
        ),
    )


def failure(name, error):
    # Trace locations help debugging without leaking exception text or source literals.
    event(
        name,
        level="ERROR",
        error_type=type(error).__name__,
        frames=[
            {"file": Path(f.filename).name, "line": f.lineno, "function": f.name}
            for f in extract_tb(error.__traceback__)
        ],
    )
