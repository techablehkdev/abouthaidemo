# -*- coding: utf-8 -*-
from odoo import api, models, fields, registry
import logging

_logger = logging.getLogger(__name__)


class POSProductAttribute(models.Model):
    _name = "pos.product.attribute"
    _description = "Allow cashier add multi attribute to Main Product"
    _rec_name = "attribute_id"

    sequence = fields.Integer('Sequence No.', default=0)
    attribute_id = fields.Many2one('product.attribute', string="Attribute", ondelete='restrict', required=True, index=True)
    value_ids = fields.Many2many(
        'product.attribute.value',
        'pos_product_attribute_product_attribute_value_rel',
        'pos_product_attribute_id',
        'product_attribute_value_id',
        string='Attribute Values',
        required=1
    )
    product_id = fields.Many2one('product.product', string='Main Product', required=1)

    @api.onchange('attribute_id')
    def onchange_attribute_id(self):
        if self.attribute_id:
            self.value_ids = [[6, 0, [v.id for v in self.attribute_id.value_ids]]]