# -*- coding: utf-8 -*-

from odoo import fields, models, api


class ProductTemplate(models.Model):
    _inherit = "product.template"

    product_margin = fields.Float(string='Margin(%)', compute='compute_margin', store=True)

    @api.depends('list_price', 'standard_price')
    def compute_margin(self):
        for product_tmpl in self:
            if product_tmpl.list_price and product_tmpl.standard_price:
                product_tmpl.product_margin = ((product_tmpl.list_price - product_tmpl.standard_price) / product_tmpl.standard_price) * 100
            else:
                product_tmpl.product_margin = 0


class ProductProduct(models.Model):
    _inherit = "product.product"

    product_margin = fields.Float(string='Margin(%)', compute='compute_margin', store=True)

    @api.depends('lst_price', 'standard_price')
    def compute_margin(self):
        for product in self:
            if product.lst_price and product.standard_price:
                lst_price = product.lst_price
                standard_price = product.standard_price
                margin = ((lst_price - standard_price) / standard_price) * 100
                product.product_margin = margin
            else:
                product.product_margin = 0
