# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from datetime import datetime, timedelta


class GiftCar(models.Model):
    _inherit = "gift.card"

    count_redeem = fields.Integer('Count Used Time', compute='_count_redeem_transactions')

    def _count_redeem_transactions(self):
        for g in self:
            g.count_redeem = len(g.redeem_line_ids) + len(g.redeem_pos_order_line_ids)

    @api.model
    def search_read(self, domain=None, fields=None, offset=0, limit=None, order=None):
        context = self._context.copy()
        if context.get('pos_config_id', None):
            limit = 100
        return super().search_read(domain=domain, fields=fields, offset=offset, limit=limit, order=order)
