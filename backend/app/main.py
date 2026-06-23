import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.exceptions import AppException, app_exception_handler
from app.routers import auth, accounts, expenses, income, budgets, loans, net_worth, investments, assets, goals, credit_cards, health_score, subscriptions, insurance, reports, ai, calendar

logging.basicConfig(level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    # Seed expense categories on startup
    try:
        from app.database import SessionLocal
        from app.seed import seed_expense_categories
        db = SessionLocal()
        seed_expense_categories(db)
        db.close()
    except Exception as e:
        logger.warning("Seed skipped: %s", str(e))
    logger.info("ArthaA API started — env: %s", settings.APP_ENV)
    yield
    logger.info("ArthaA API shutting down")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppException, app_exception_handler)

# ── Routers ────────────────────────────────────────────────────────────────
app.include_router(auth.router,        prefix=API_PREFIX)
app.include_router(accounts.router,    prefix=API_PREFIX)
app.include_router(expenses.router,    prefix=API_PREFIX)
app.include_router(income.router,      prefix=API_PREFIX)
app.include_router(budgets.router,     prefix=API_PREFIX)
app.include_router(loans.router,       prefix=API_PREFIX)
app.include_router(net_worth.router,   prefix=API_PREFIX)
app.include_router(investments.router, prefix=API_PREFIX)
app.include_router(assets.router,      prefix=API_PREFIX)
app.include_router(goals.router,       prefix=API_PREFIX)
app.include_router(credit_cards.router,  prefix=API_PREFIX)
app.include_router(health_score.router,   prefix=API_PREFIX)
app.include_router(subscriptions.router,  prefix=API_PREFIX)
app.include_router(insurance.router,      prefix=API_PREFIX)
app.include_router(reports.router,        prefix=API_PREFIX)
app.include_router(ai.router,            prefix=API_PREFIX)
app.include_router(calendar.router,      prefix=API_PREFIX)


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


@app.get("/")
async def root():
    return {"message": f"Welcome to {settings.APP_NAME} API", "docs": "/docs"}
