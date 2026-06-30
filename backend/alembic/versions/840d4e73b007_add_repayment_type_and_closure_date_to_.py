"""add repayment_type and closure_date to loans

Revision ID: 840d4e73b007
Revises: f0b2fa106f61
Create Date: 2026-06-23 08:40:28.901494

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '840d4e73b007'
down_revision: Union[str, None] = 'f0b2fa106f61'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    repaymenttype = sa.Enum('emi', 'bullet', name='repaymenttype')
    repaymenttype.create(op.get_bind(), checkfirst=True)
    op.add_column('loans', sa.Column('repayment_type', repaymenttype, server_default='emi', nullable=False))
    op.add_column('loans', sa.Column('closure_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('loans', 'closure_date')
    op.drop_column('loans', 'repayment_type')
    sa.Enum(name='repaymenttype').drop(op.get_bind(), checkfirst=True)
