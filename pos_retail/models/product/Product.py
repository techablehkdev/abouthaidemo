# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from datetime import datetime, date
from odoo.exceptions import UserError

from itertools import groupby
from operator import itemgetter
import logging

_logger = logging.getLogger(__name__)


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    pos_combo_item_ids = fields.One2many('pos.combo.item', 'product_combo_id', string='Combo Items')
    is_combo = fields.Boolean(
        'Combo Bundle/Pack',
        help='Active it and see to tab Combo/Pack and adding Items for Combo Future'
    )
    is_combo_item = fields.Boolean(
        'Dynamic Combo Item',
        help='Allow this product become item combo of Another Product'
    )
    combo_limit = fields.Integer(
        'Combo Item Limit',
        help='Limit combo items can allow cashier add / combo')
    is_credit = fields.Boolean('Is Credit', default=False)
    multi_category = fields.Boolean('Multi Category')
    pos_categ_ids = fields.Many2many(
        'pos.category',
        string='POS Multi Category')
    multi_uom = fields.Boolean('Multi Unit')
    price_uom_ids = fields.One2many(
        'product.uom.price',
        'product_tmpl_id',
        string='Price by Sale Unit')
    multi_variant = fields.Boolean('Multi Variant and Attribute')
    pos_variant_ids = fields.One2many(
        'product.variant',
        'product_tmpl_id',
        string='Variants and Attributes of Product')
    cross_selling = fields.Boolean('Cross Selling')
    cross_ids = fields.One2many(
        'product.cross',
        'product_tmpl_id',
        string='Cross Selling Items')
    supplier_barcode = fields.Char(
        'Supplier Barcode', copy=False,
        help="Supplier Barcode Product, You can Input here and scan on POS")
    barcode_ids = fields.One2many(
        'product.barcode',
        'product_tmpl_id',
        string='Multi Barcode')
    pos_sequence = fields.Integer('POS Sequence')
    is_voucher = fields.Boolean('Is Voucher', default=0)
    sale_with_package = fields.Boolean('Sale with Package')
    pizza_modifier = fields.Boolean('Pizza Modifier')
    price_unit_each_qty = fields.Boolean('Active Sale Price each Quantity')
    product_price_quantity_ids = fields.One2many(
        'product.price.quantity',
        'product_tmpl_id',
        'Price each Quantity')
    qty_warning_out_stock = fields.Float('Qty Warning out of Stock', default=10)
    combo_price = fields.Float(
        'Combo Item Price',
        help='This Price will replace public price and include to Line in Cart'
    )
    combo_limit_ids = fields.One2many(
        'pos.combo.limit',
        'product_tmpl_id',
        'Combo Limited Items by Category'
    )
    name_second = fields.Char(
        'Second Name',
        help='If you need print pos receipt Arabic,Chinese...language\n'
             'Input your language here, and go to pos active Second Language')
    special_name = fields.Char('Special Name')
    uom_ids = fields.Many2many('uom.uom', string='Units the same category', compute='_get_uoms_the_same_category')
    note_ids = fields.Many2many(
        'pos.note',
        'product_template_note_rel',
        'product_tmpl_id',
        'note_id',
        string='Notes Fixed'
    )
    tag_ids = fields.Many2many(
        'pos.tag',
        'product_template_tag_rel',
        'product_tmpl_id',
        'tag_id',
        string='Tags'
    )
    pos_branch_id = fields.Many2one('pos.branch', string='Branch')
    commission_rate = fields.Float(
        'Commission Rate',
        default=50,
        help='Commission Rate (%) for sellers'
    )
    cycle = fields.Integer(
        'Cycle',
        help='Total cycle times, customer can use in Spa Business'
    )
    addon_id = fields.Many2one(
        'product.addons',
        string='Addon',
    )
    discountable = fields.Boolean(
        'Discountable',
        default=True,
        help='If it checked, not allow POS Cashier set Discount'
    )
    refundable = fields.Boolean(
        'Refundable',
        default=True,
        help='If it checked, not allow POS Cashier refund Product'
    )
    open_price = fields.Boolean(
        'Open Price Item',
        help='If it checked, when Cashier add to cart, auto ask price of this Product'
    )
    product_brand_id = fields.Many2one('pos.product.brand', 'Brand')

    def add_barcode(self):
        newCode = None
        for product in self:
            format_code = "%s%s%s" % ('777', product.id, datetime.now().strftime("%d%m%y%H%M"))
            barcode = self.env['barcode.nomenclature'].sanitize_ean(format_code)
            product.write({'barcode': barcode})
            newCode = barcode
        return newCode

    def random_barcode(self):
        for product in self:
            format_code = "%s%s%s" % ('333', product.id, datetime.now().strftime("%d%m%y%H%M"))
            barcode = self.env['barcode.nomenclature'].sanitize_ean(format_code)
            product.write({'supplier_barcode': barcode})
        return True

    @api.model
    def create(self, vals):
        if not vals.get('pos_branch_id'):
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        product_tmpl = super(ProductTemplate, self).create(vals)
        return product_tmpl

    @api.onchange('uom_id')
    def onchange_uom_id(self):
        if self.uom_id:
            uoms = self.env['uom.uom'].search([('category_id', '=', self.uom_id.category_id.id)])
            self.uom_ids = [(6, 0, [uom.id for uom in uoms])]

    def _get_uoms_the_same_category(self):
        for product in self:
            uoms = self.env['uom.uom'].search([('category_id', '=', product.uom_id.category_id.id)])
            product.uom_ids = [(6, 0, [uom.id for uom in uoms])]

    def write(self, vals):
        res = super(ProductTemplate, self).write(vals)
        for product_temp in self:
            products = self.env['product.product'].search([('product_tmpl_id', '=', product_temp.id)])
            products.write({'write_date': product_temp.write_date})
        return res

    def unlink(self):
        for product_temp in self:
            product_ids = []
            products = self.env['product.product'].search([('product_tmpl_id', '=', product_temp.id)])
            for product in products:
                self.env['pos.cache.database'].sudo().create({
                    'res_model': 'product.product',
                    'res_id': product.id,
                    'deleted': True
                })
        return super(ProductTemplate, self).unlink()


class ProductProduct(models.Model):
    _inherit = 'product.product'

    college_id = fields.Many2one('product.college', 'College')
    model_id = fields.Many2one('product.model', 'Model')
    sex_id = fields.Many2one('product.sex', 'Sex')
    plu_number = fields.Char('PLU Number')
    attribute_ids = fields.One2many(
        'pos.product.attribute',
        'product_id',
        string='POS Product Attribute Values',
        help='Allow cashier ordered attribute values of Main Product'
    )
    minimum_price = fields.Float(
        'Minimum Price',
        default=0,
        help='Not allow cashier set price smaller than or equal this Price'
    )

    def getProductInformation(self, price, quantity, pos_config_id):
        self.ensure_one()
        config = self.env['pos.config'].browse(pos_config_id)

        # Tax related
        taxes = self.taxes_id.compute_all(price, config.currency_id, quantity, self)
        all_prices = {
            'price_without_tax': taxes['total_excluded'] / quantity,
            'price_with_tax': taxes['total_included'] / quantity,
            'tax_details': [{'name': tax['name'], 'amount': tax['amount'] / quantity} for tax in taxes['taxes']],
        }

        # Pricelists
        if config.use_pricelist:
            pricelists = config.available_pricelist_ids
        else:
            pricelists = config.pricelist_id
        price_per_pricelist_id = pricelists.price_get(self.id, quantity)
        pricelist_list = [
            {
                'name': pl.name,
                'id': pl.id,
                'price': price_per_pricelist_id[pl.id]
            } for pl in pricelists]

        # Warehouses
        warehouse_list = [
            {
                'name': w.name,
                'available_quantity': self.with_context({'warehouse': w.id}).qty_available,
                'forecasted_quantity': self.with_context({'warehouse': w.id}).virtual_available,
                'uom': self.uom_name
            }
            for w in self.env['stock.warehouse'].search([])]

        # Stock Location list
        location_list = [
            {
                'name': l.complete_name,
                'available_quantity': self.with_context({'location': l.id}).qty_available,
                'forecasted_quantity': self.with_context({'location': l.id}).virtual_available,
                'uom': self.uom_name
            }
            for l in self.env['stock.location'].search([('usage', '=', 'internal')])]
        # Lots
        lots = [
            {
                'id': l.id,
                'name': l.name,
                'ref': l.ref,
                'product_qty': l.product_qty,
            }
            for l in self.env['stock.production.lot'].search(
                [
                    ('product_id', '=', self.id),
                    ('product_qty', '>', 0),
                ])]

        # Suppliers
        key = itemgetter('name')
        supplier_list = []
        for key, group in groupby(sorted(self.seller_ids, key=key), key=key):
            for s in list(group):
                if not ((s.date_start and s.date_start > date.today()) or (
                        s.date_end and s.date_end < date.today()) or (s.min_qty > quantity)):
                    supplier_list.append({
                        'name': s.name.name,
                        'delay': s.delay,
                        'price': s.price
                    })
                    break

        # Variants
        variant_list = [{
            'name': attribute_line.attribute_id.name,
            'values': list(
                map(lambda attr_name: {'name': attr_name, 'search': '%s %s' % (self.name, attr_name)},
                    attribute_line.value_ids.mapped('name')))
        }
            for attribute_line in self.attribute_line_ids]

        return {
            'lots': lots,
            'all_prices': all_prices,
            'pricelists': pricelist_list,
            'warehouses': warehouse_list,
            'suppliers': supplier_list,
            'locations': location_list,
            'variants': variant_list
        }

    def force_write(self, vals):
        self.sudo().write(vals)
        return True

    def force_create(self, vals):
        product = self.sudo().create(vals)
        return product.id

    def unlink(self):
        for product in self:
            if product.product_tmpl_id and product.product_tmpl_id.available_in_pos:
                linesHavePurchased = self.env['pos.order.line'].search([('product_id', '=', product.id)])
                if linesHavePurchased:
                    raise UserError(
                        _('You cannot delete a product . Because products have exsting in POS Order Lines'))
            else:
                self.env['pos.cache.database'].sudo().create({
                    'res_model': 'product.product',
                    'res_id': product.id,
                    'deleted': True
                })
        res = super(ProductProduct, self).unlink()
        return res

    def add_barcode(self):
        newCode = None
        for product in self:
            format_code = "%s%s%s" % ('777', product.id, datetime.now().strftime("%d%m%y%H%M"))
            barcode = self.env['barcode.nomenclature'].sanitize_ean(format_code)
            product.write({'barcode': barcode})
            newCode = barcode
        return newCode

    def write(self, vals):
        res = super(ProductProduct, self).write(vals)
        product_ids = []
        for p in self:
            product_ids.append(p.id)
        sessions = self.env['pos.session'].search([
            ('state', '=', 'opened')
        ])
        for s in sessions:
            self.env['bus.bus']._sendone(s.user_id.partner_id, 'bus.sync.product', {
                'product_ids': product_ids
            })
        return res
