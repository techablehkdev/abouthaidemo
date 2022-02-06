# -*- coding: utf-8 -*-
from odoo import fields, api, models

import logging
import json

_logger = logging.getLogger(__name__)


class StockQuant(models.Model):
    _inherit = "stock.quant"

    def action_apply_inventory(self):
        res = super(StockQuant, self).action_apply_inventory()
        for quant in self:
            self.send_notification_pos(quant.location_id.id, [quant.product_id.id])
        return res

    def send_notification_pos(self, location_id, product_ids):
        sessions = self.env['pos.session'].sudo().search([
            ('state', '=', 'opened'),
            ('config_id.display_onhand', '=', True)
        ])
        for session in sessions:
            _logger.info('update stock for session id: %s' % session.id)
            datas = {
                'location_id': location_id,
                'product_ids': product_ids,
            }
            self.env['bus.bus']._sendone(session.user_id.partner_id, 'pos.sync.stock', datas)
        return True

    @api.model
    def create(self, vals):
        quant = super(StockQuant, self).create(vals)
        self.send_notification_pos(quant.location_id.id, [quant.product_id.id])
        return quant

    def write(self, vals):
        res = super(StockQuant, self).write(vals)
        for quant in self:
            self.send_notification_pos(quant.location_id.id, [quant.product_id.id])
        return res
