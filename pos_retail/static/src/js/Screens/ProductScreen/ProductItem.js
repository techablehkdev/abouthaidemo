odoo.define('pos_retail.ProductItem', function (require) {
    'use strict';

    const ProductItem = require('point_of_sale.ProductItem');
    const Registries = require('point_of_sale.Registries');
    ProductItem.template = 'RetailProductItem';
    Registries.Component.add(ProductItem);
    const core = require('web.core');
    const qweb = core.qweb;
    const {useState} = owl.hooks;
    const {posbus} = require('point_of_sale.utils');
    const bus = require('pos_retail.core_bus');

    const RetailProductItem = (ProductItem) =>
        class extends ProductItem {
            constructor() {
                super(...arguments);
                this.state = useState({
                    refresh: 'waiting',
                })
            }

            async changeVariant() {
                let product = this.props.product
                let products = this.env.pos.db.total_variant_by_product_tmpl_id[product.product_tmpl_id]
                let attribute_ids = [];
                let attributes = [];
                for (var i = 0; i < products.length; i++) {
                    let productVariant = products[i];
                    if (productVariant.product_template_attribute_value_ids) {
                        for (var j = 0; j < productVariant.product_template_attribute_value_ids.length; j++) {
                            var attribute_id = productVariant.product_template_attribute_value_ids[j];
                            if (attribute_ids.indexOf(attribute_id) == -1) {
                                attribute_ids.push(attribute_id)
                                attributes.push(this.env.pos.attribute_value_by_id[attribute_id])
                            }
                        }
                    }
                }
                if (attributes.length && products.length) {
                    const {confirmed, payload} = await this.showPopup('PopUpSelectProductAttributes', {
                        title: this.env._t('Select Attributes and Values of : ') + this.props.product.display_name,
                        products: products,
                        attributes: attributes,
                    });
                    if (confirmed) {
                        let product_ids = payload.product_ids
                        if (product_ids.length) {
                            for (let index in product_ids) {
                                let product_id = product_ids[index]
                                let productAddToCart = this.env.pos.db.get_product_by_id(product_id);
                                this.env.pos.get_order().add_product(productAddToCart, {
                                    open_popup: true
                                })
                            }
                        }
                    }
                }
            }

            async showProductInfo() {
                let {confirmed, payload: result} = await this.showPopup('PopUpProductInfo', {
                    title: this.env._t('Information Detail of ') + this.props.product.display_name,
                    product: this.props.product,
                    quantity: 1
                });
                if (confirmed) {
                    const product = result.product
                    this.trigger('click-product', product);
                }
            }

            async _autoSyncBackend() {
                if (!this.env.pos.config.sync_products_realtime || this.env.pos.networkCrashed) {
                    return true
                }
                const products = await this.env.pos.getDatasByModel('product.product', [['id', '=', this.props.product.id]])
                if (products.length > 0) {
                    this.env.pos.update_indexDB('product.product', products)
                } else {
                    this.env.pos._syncProducts()
                }
            }

            mounted() {
                super.mounted();
                posbus.on('reload.product.item', this, this._updateProduct)
                this.startPolling()
            }

            willUnmount() {
                super.willUnmount();
                posbus.off('reload.product.item', this, null)
            }

            startPolling() {
                this.bus = bus.bus
                this.bus.last = 0
                this.bus.on("notification", this, this._busNotification);
                this.bus.start_polling();
            }

            async _busNotification(notifications) {
                if (notifications && notifications[0] && notifications[0][1]) {
                    const type = notifications[0][1]['type']
                    const payload = notifications[0][1]['payload']
                    if (type == "bus.sync.product" && payload.product_ids.indexOf(this.props.product.id) != -1) {
                        console.warn('!!! event on_notification()')
                        console.log(type)
                        console.log(payload)
                        const products = await this.env.pos.getDatasByModel('product.product', [['id', 'in', payload.product_ids]])
                        if (products.length > 0) {
                            this.env.pos.update_indexDB('product.product', products)
                        }
                    }
                }
            }

            _updateProduct(product_id) {
                if (product_id == this.props.product.id) {
                    let product = this.env.pos.db.get_product_by_id(product_id)
                    this.props.product = product
                    this.render()
                }
            }

            get disableSale() {
                if (this.props.product['removed'] || !this.props.product.active || (this.env.pos.config.hide_product_when_outof_stock && !this.env.pos.config.allow_order_out_of_stock && this.props.product.type == 'product' && this.props.product.qty_available <= 0) || !this.props.product.available_in_pos) {
                    console.warn('not allow display: ' + this.props.product.display_name)
                    return true
                } else {
                    return false
                }
            }

            get price() {
                let price = 0;
                if (this.env.pos.config.display_sale_price_within_tax) {
                    price = this.props.product.get_price_with_tax(this.pricelist, 1)
                } else {
                    price = this.props.product.get_price(this.pricelist, 1)
                }
                const formattedUnitPrice = this.env.pos.format_currency(
                    price,
                    'Product Price'
                );
                if (this.props.product.to_weight) {
                    return `${formattedUnitPrice}/${
                        this.env.pos.units_by_id[this.props.product.uom_id[0]].name
                    }`;
                } else {
                    return formattedUnitPrice;
                }
            }

            async editProduct() {
                let {confirmed, payload: results} = await this.showPopup('PopUpCreateProduct', {
                    title: this.env._t('Edit ') + this.props.product.display_name,
                    product: this.props.product
                })
                if (confirmed && results) {
                    let value = {
                        name: results.name,
                        list_price: parseFloat(results.list_price),
                        default_code: results.default_code,
                        barcode: results.barcode,
                        standard_price: parseFloat(results.standard_price),
                        type: results.type,
                        available_in_pos: true
                    }
                    if (results.pos_categ_id != 'null') {
                        value['pos_categ_id'] = parseInt(results['pos_categ_id'])
                    }
                    if (results.product_brand_id != 'null') {
                        value['product_brand_id'] = parseInt(results['product_brand_id'])
                    } else {
                        value['product_brand_id'] = null
                    }
                    if (results.image_1920) {
                        value['image_1920'] = results.image_1920.split(',')[1];
                    }
                    await this.rpc({
                        model: 'product.product',
                        method: 'write',
                        args: [[this.props.product.id], value]
                    })
                    this.env.pos._syncProducts()
                }
            }

            async archiveProduct() {
                let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Warning !!!'),
                    body: this.env._t('Are you sure want Archive Product Name: ') + this.props.product.display_name + this.env._t(' ?')
                })
                if (confirmed) {
                    await this.rpc({
                        model: 'product.product',
                        method: 'write',
                        args: [[this.props.product.id], {
                            available_in_pos: false,
                        }],
                        context: {}
                    })
                    this.env.pos._syncProducts()
                }
            }

            async addBarcode() {
                let newBarcode = await this.rpc({
                    model: 'product.product',
                    method: 'add_barcode',
                    args: [[this.props.product.id]]
                })
                if (newBarcode) {
                    this.props.product['barcode'] = newBarcode
                    this.printBarcode()
                    this.env.pos._syncProducts()
                }
            }

            async printBarcode() {
                await this.env.pos.do_action('pos_retail.report_product_product_barcode', {
                    additional_context: {
                        active_id: this.props.product.id,
                        active_ids: [this.props.product.id],
                    }
                }, {
                    shadow: true,
                    timeout: 6500
                });
            }
        }
    Registries.Component.extend(ProductItem, RetailProductItem);

    return ProductItem;
});
