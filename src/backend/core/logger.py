import logging
from pythonjsonlogger import jsonlogger


logger = logging.getLogger("antifraud")
logger.setLevel(logging.INFO)

if not logger.handlers:
    handler = logging.StreamHandler()
    fmt = jsonlogger.JsonFormatter('%(asctime)s %(levelname)s %(name)s %(message)s')
    handler.setFormatter(fmt)
    logger.addHandler(handler)
