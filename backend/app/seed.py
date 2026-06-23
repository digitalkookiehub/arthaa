import logging

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

INDIAN_EXPENSE_CATEGORIES = [
    {"name": "Food", "icon": "🍽️", "color": "#FF6B6B"},
    {"name": "Milk", "icon": "🥛", "color": "#F8F9FA"},
    {"name": "Groceries", "icon": "🛒", "color": "#51CF66"},
    {"name": "Vegetables", "icon": "🥦", "color": "#40C057"},
    {"name": "Petrol", "icon": "⛽", "color": "#FF922B"},
    {"name": "Medical", "icon": "🏥", "color": "#F03E3E"},
    {"name": "School Fees", "icon": "🎓", "color": "#339AF0"},
    {"name": "Electricity", "icon": "⚡", "color": "#FAB005"},
    {"name": "Water", "icon": "💧", "color": "#4DABF7"},
    {"name": "Gas", "icon": "🔥", "color": "#FF6348"},
    {"name": "Internet", "icon": "🌐", "color": "#748FFC"},
    {"name": "Mobile", "icon": "📱", "color": "#63E6BE"},
    {"name": "Entertainment", "icon": "🎬", "color": "#F783AC"},
    {"name": "Insurance", "icon": "🛡️", "color": "#4C6EF5"},
    {"name": "EMIs", "icon": "🏦", "color": "#CC5DE8"},
    {"name": "Travel", "icon": "✈️", "color": "#20C997"},
    {"name": "Shopping", "icon": "🛍️", "color": "#E64980"},
    {"name": "Home & Maintenance", "icon": "🏠", "color": "#FFA94D"},
    {"name": "Health & Fitness", "icon": "💪", "color": "#69DB7C"},
    {"name": "Miscellaneous", "icon": "📦", "color": "#868E96"},
]


def seed_expense_categories(db: Session) -> None:
    from app.models.expense import ExpenseCategory

    existing = {c.name for c in db.query(ExpenseCategory.name).all()}
    new_cats = [
        ExpenseCategory(name=c["name"], icon=c["icon"], color=c["color"], is_system=True)
        for c in INDIAN_EXPENSE_CATEGORIES
        if c["name"] not in existing
    ]
    if new_cats:
        db.add_all(new_cats)
        db.commit()
        logger.info("Seeded %d expense categories", len(new_cats))
    else:
        logger.info("Expense categories already seeded")
