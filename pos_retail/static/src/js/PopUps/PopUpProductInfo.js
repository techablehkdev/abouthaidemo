odoo.define('pos_retail.PopUpProductInfo', function (require) {
    'use strict';

    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {useListener} = require('web.custom_hooks');

    /**
     * This popup needs to be self-dependent because it needs to be called from different place. In order to avoid code
     * Props:
     *  {
     *      product: a product object
     *      quantity: number
     *  }
     */
    class PopUpProductInfo extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this._currentOrder = this.env.pos.get_order()
            useListener('accept-input', this.confirm);
            useListener('close-this-popup', this.cancel);
            NumberBuffer.use({
                triggerAtEnter: 'accept-input',
                triggerAtEscape: 'close-this-popup',
            });
        }

        getCostOfOrder() {
            return this._currentOrder.orderlines.reduce((function (sum, orderLine) {
                return sum + (orderLine.product.standard_price * orderLine.quantity)
            }), 0)
        }

        async willStart() {
            const self = this
            this.productInfo = await this.rpc({
                model: 'product.product',
                method: 'getProductInformation',
                args: [[this.props.product.id],
                    this.props.product.get_price(this._currentOrderpricelist, this.props.quantity),
                    this.props.quantity,
                    this.env.pos.config_id]
            })
            if (!this.productInfo) {
                return null
            }
            const priceWithoutTax = this.productInfo['all_prices']['price_without_tax'];
            const margin = priceWithoutTax - this.props.product.standard_price;
            const orderPriceWithoutTax = this._currentOrder.get_total_without_tax();
            const orderCost = this.getCostOfOrder();
            const orderMargin = orderPriceWithoutTax - orderCost;

            this.costCurrency = this.env.pos.format_currency(this.props.product.standard_price);
            this.marginCurrency = this.env.pos.format_currency(margin);
            this.marginPercent = priceWithoutTax ? Math.round(margin / priceWithoutTax * 10000) / 100 : 0;
            this.orderPriceWithoutTaxCurrency = this.env.pos.format_currency(orderPriceWithoutTax);
            this.orderCostCurrency = this.env.pos.format_currency(orderCost);
            this.orderMarginCurrency = this.env.pos.format_currency(orderMargin);
            this.orderMarginPercent = orderPriceWithoutTax ? Math.round(orderMargin / orderPriceWithoutTax * 10000) / 100 : 0;
        }


        // searchProduct(productName) {
        //     posbus.trigger('search-product-from-info-popup', productName);
        //     this.cancel()
        // }

        async addToCartWithLot(lot_id) {
            let packLotLinesToEdit = this.env.pos.lots.filter(l => l.id == lot_id)
            if (packLotLinesToEdit && packLotLinesToEdit.length != 0) {
                packLotLinesToEdit.forEach((l) => l.text = l.name)
                const lotList = packLotLinesToEdit.map(l => ({
                    id: l.id,
                    item: l,
                }))
                const selectedLot = [lotList[0]['item']]
                const newPackLotLines = selectedLot
                    .filter(item => item.id)
                    .map(item => ({lot_name: item.name}));
                const modifiedPackLotLines = selectedLot
                    .filter(item => !item.id)
                    .map(item => ({lot_name: item.text}));

                const draftPackLotLines = {modifiedPackLotLines, newPackLotLines};
                await this._currentOrder.add_product(this.props.product, {
                    draftPackLotLines,
                    price_extra: 0,
                    quantity: 1,
                })
            } else {
                this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Lot not found, may you need reload POS for update new Lots')
                })
            }
        }

        async OnChangeQty(event) {
            const newQty = event.target.value;
            this.props.line.set_quantity(newQty)
        }

        async OnChangeDiscount(event) {
            const newDiscount = event.target.value;
            if (this.env.pos.config.validate_discount_change && !this.props.line.discount_has_valid && ((this.env.pos.config.validate_discount_change_type == 'increase' && this.props.line.discount < parseFloat(newDiscount)) || (this.env.pos.config.validate_discount_change_type == 'decrease' && this.props.line.quantity > parseFloat(newDiscount)) || this.env.pos.config.validate_discount_change_type == 'both')) {
                let validate = await this.env.pos._validate_action(this.env._t(' Need approved set new Discount: ') + parseFloat(newDiscount)) + ' ( % )';
                if (!validate) {
                    event.target.value = this.props.line.discount
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('You have permission set Discount, required request your Manager approve it.')
                    });
                } else {
                    this.props.line.discount_has_valid = true
                }
            }
            this.props.line.set_discount(newDiscount)
            this.render()
        }

        async OnChangePrice(event) {
            const newPrice = event.target.value;
            if (!this.props.line.price_has_valid && this.env.pos.config.validate_price_change && ((this.env.pos.config.validate_price_change_type == 'increase' && this.props.line.price < parseFloat(newPrice)) || (this.env.pos.config.validate_price_change_type == 'decrease' && this.props.line.price > parseFloat(newPrice)) || this.env.pos.config.validate_price_change_type == 'both')) {
                let validate = await this.env.pos._validate_action(this.env._t(' Need approved set new Price: ') + parseFloat(newPrice));
                if (!validate) {
                    event.target.value = this.props.line.price
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('You have permission set Price, required request your Manager approve it.')
                    });
                } else {
                    this.props.line.price_has_valid = true
                }
            }
            this.props.line.set_unit_price(newPrice)
            this.render()
        }

        OnChangeNote(event) {
            const newNote = event.target.value;
            this.props.line.set_line_note(newNote)
            this.render()
        }

        async setPricelistToOrder(pricelist_id) {
            const pricelist = this.env.pos.pricelist_by_id[pricelist_id]
            if (pricelist) {
                this._currentOrder.set_pricelist(pricelist)
            }

        }

        getPayload() {
            return {
                product: this.props.product
            }
        }
    }

    PopUpProductInfo.template = 'PopUpProductInfo';
    Registries.Component.add(PopUpProductInfo);
});
