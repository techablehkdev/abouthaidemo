odoo.define('pos_retail.OrderCartAction', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const {useState} = owl.hooks;
    const Registries = require('point_of_sale.Registries');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {useListener} = require('web.custom_hooks');
    const {posbus} = require('point_of_sale.utils')

    class OrderCartAction extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({
                numpadMode: 'quantity',
                screen: this.props.screen,
                openCart: true,
                displayCheckout: true,
                _scannerIsRunning: false,
            })
            this._currentOrder = this.env.pos.get_order();
            if (this._currentOrder) {
                this._currentOrder.orderlines.on('change', this._updateSummary, this);
                this._currentOrder.orderlines.on('remove', this._updateSummary, this);
                this._currentOrder.paymentlines.on('change', this._updateSummary, this);
                this._currentOrder.paymentlines.on('remove', this._updateSummary, this);
                this.env.pos.on('change:selectedOrder', this._updateCurrentOrder, this);
                this._updateSummary()
            }
        }

        get itemsInCart() {
            if (this._currentOrder.orderlines.length > 0) {
                return true
            } else {
                return false
            }
        }

        mounted() {
            super.mounted();
            posbus.on('numpad-change-mode', this, this._updateNumpadMode);
        }

        willUnmount() {
            super.willUnmount()
            posbus.off('numpad-change-mode', null, null)
        }

        async editCustomer(client) {
            this.partnerIntFields = ['title', 'country_id', 'state_id', 'property_product_pricelist', 'id']
            let {confirmed, payload: results} = await this.showPopup('PopUpCreateCustomer', {
                title: this.env._t('Update Informaton of ') + client.name,
                partner: client
            })
            if (confirmed) {
                if (results.error) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: results.error
                    })
                }
                const partnerValue = {
                    'name': results.name,
                }
                if (results.image_1920) {
                    partnerValue['image_1920'] = results.image_1920.split(',')[1]
                }
                if (results.title) {
                    partnerValue['title'] = results.title
                }
                if (!results.title && this.env.pos.partner_titles) {
                    partnerValue['title'] = this.env.pos.partner_titles[0]['id']
                }
                if (results.street) {
                    partnerValue['street'] = results.street
                }
                if (results.city) {
                    partnerValue['city'] = results.city
                }
                if (results.street) {
                    partnerValue['street'] = results.street
                }
                if (results.phone) {
                    partnerValue['phone'] = results.phone
                }
                if (results.mobile) {
                    partnerValue['mobile'] = results.mobile
                }

                if (results.birthday_date) {
                    partnerValue['birthday_date'] = results.birthday_date
                }
                if (results.barcode) {
                    partnerValue['barcode'] = results.barcode
                }
                if (results.comment) {
                    partnerValue['comment'] = results.comment
                }
                if (results.property_product_pricelist) {
                    partnerValue['property_product_pricelist'] = results.property_product_pricelist
                } else {
                    partnerValue['property_product_pricelist'] = null
                }
                if (results.country_id) {
                    partnerValue['country_id'] = results.country_id
                }
                let valueWillSave = {}
                for (let [key, value] of Object.entries(partnerValue)) {
                    if (this.partnerIntFields.includes(key)) {
                        valueWillSave[key] = parseInt(value) || false;
                    } else {
                        if ((key == 'birthday_date' && value != client.birthday_date) || key != 'birthday_date') {
                            valueWillSave[key] = value;
                        }
                    }
                }
                let partner_id = client.id
                let updatePartner = await this.rpc({
                    model: 'res.partner',
                    method: 'write',
                    args: [[partner_id], valueWillSave],
                    context: {}
                })
                if (updatePartner) {
                    await this.env.pos._syncPartners()
                    let partner = this.env.pos.db.get_partner_by_id(partner_id);
                    if (partner) {
                        this.env.pos.get_order().set_client(partner)
                    }
                }
            }
        }

        get isLongName() {
            let selectedOrder = this.env.pos.get_order()
            if (selectedOrder && selectedOrder.get_client()) {
                return selectedOrder.get_client() && selectedOrder.get_client().name.length > 10;
            } else {
                return false
            }
        }

        _updateCurrentOrder(pos, newSelectedOrder) {
            if (newSelectedOrder) {
                this._currentOrder = newSelectedOrder;
            }
        }

        backToCart() {
            posbus.trigger('set-screen', 'Products')
            this.env.pos.config.sync_multi_session = true
        }

        get isCustomerSet() {
            if (this.env.pos.get_order() && this.env.pos.get_order().get_client()) {
                return true
            } else {
                return false
            }
        }

        get client() {
            return this._currentOrder.get_client()
        }

        get currentOrder() {
            return this._currentOrder
        }


        async _updateNumpadMode(event) {
            const {mode} = event.detail;
            this.state.numpadMode = mode;
        }

        get payButtonClasses() {
            if (!this._currentOrder) return {};
            let hidden = false
            let warning = false
            let highlight = false
            if (!this.env.pos.config.allow_payment || this.state.screen != 'Products' || this.env.isMobile) {
                hidden = true
            }
            if (this._currentOrder.is_return || this._currentOrder.get_total_with_tax() < 0) {
                warning = true
            } else {
                highlight = true
            }
            return {
                highlight: highlight,
                oe_hidden: hidden,
                warning: warning
            }
        }

        _updateCurrentOrder(pos, newSelectedOrder) {
            this._currentOrder.orderlines.off('change', null, this);
            if (newSelectedOrder) {
                this._currentOrder = newSelectedOrder;
                this._currentOrder.orderlines.on('change', this._updateSummary, this);
            }
        }

        _updateSummary() {
            const total = this._currentOrder ? this._currentOrder.get_total_with_tax() : 0;
            const tax = this._currentOrder ? total - this._currentOrder.get_total_without_tax() : 0;
            this.state.total = this.env.pos.format_currency(total);
            this.state.tax = this.env.pos.format_currency(tax);
            let productsSummary = {}
            let totalItems = 0
            let totalQuantities = 0
            let totalCost = 0
            if (this._currentOrder) {
                for (let i = 0; i < this._currentOrder.orderlines.models.length; i++) {
                    let line = this._currentOrder.orderlines.models[i]
                    totalCost += line.product.standard_price * line.quantity
                    if (!productsSummary[line.product.id]) {
                        productsSummary[line.product.id] = line.quantity
                        totalItems += 1
                    } else {
                        productsSummary[line.product.id] += line.quantity
                    }
                    totalQuantities += line.quantity
                }
            }
            const discount = this._currentOrder ? this._currentOrder.get_total_discounts() : 0;
            this.state.discount = this.env.pos.format_currency(discount);
            const totalWithOutTaxes = this._currentOrder ? this._currentOrder.get_total_without_tax() : 0;
            this.state.totalWithOutTaxes = this.env.pos.format_currency(totalWithOutTaxes);
            this.state.margin = this.env.pos.format_currency(totalWithOutTaxes - totalCost)
            this.state.totalItems = this.env.pos.format_currency_no_symbol(totalItems)
            this.state.totalQuantities = this.env.pos.format_currency_no_symbol(totalQuantities)
        }

        async setDiscount() {
            let selectedOrder = this.env.pos.get_order();
            let {confirmed, payload: discount} = await this.showPopup('NumberPopup', {
                title: this.env._t('Which value of discount Value would you apply to Order ?'),
                startingValue: 0,
                confirmText: this.env._t('Apply'),
                cancelText: this.env._t('Remove Discount'),
            })
            if (confirmed) {
                selectedOrder.set_discount_value(parseFloat(discount))
            }
        }


        async setTaxes() {
            let order = this.env.pos.get_order();
            let selectedLine = order.get_selected_orderline();
            if (!selectedLine) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Have not any line in cart')
                })
            }
            if (selectedLine.is_return || order.is_return) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('it not possible set taxes on Order return')
                })
            }
            if (selectedLine) {
                let taxes_id = selectedLine.product.taxes_id;
                let taxes = [];
                let update_tax_ids = this.env.pos.config.update_tax_ids || [];
                this.env.pos.taxes.forEach(function (t) {
                    if (update_tax_ids.indexOf(t.id) != -1) {
                        if (taxes_id.indexOf(t.id) != -1) {
                            t.selected = true
                        }
                        taxes.push(t)
                    }
                })
                if (taxes.length) {
                    let {confirmed, payload: result} = await this.showPopup('PopUpSelectionBox', {
                        title: this.env._t('Select Taxes need to apply'),
                        items: taxes
                    })
                    let tax_ids = []
                    if (confirmed) {
                        if (result.items.length) {
                            tax_ids = result.items.filter((i) => i.selected).map((i) => i.id)
                            let taxesString = selectedLine.product.display_name + this.env._t(' applied Taxes: ')
                            result.items.forEach(t => {
                                taxesString += t.name + '.'
                            })
                            this.env.pos.alert_message({
                                title: this.env._t('Successfully set Taxes'),
                                body: taxesString
                            })
                        } else {
                            this.env.pos.alert_message({
                                title: this.env._t('Successfully remove all Taxes'),
                                body: ''
                            })
                        }
                    }
                    await this._appliedTaxes(tax_ids)

                }
            } else {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Please selected 1 line for set taxes')
                })
            }

        }

        async _appliedTaxes(tax_ids) {
            let order = this.env.pos.get_order();
            let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                title: this.env._t('Need Confirm ?'),
                body: this.env._t('Apply Taxes Selected to All Line ?'),
            })
            if (!confirmed) {
                order.get_selected_orderline().set_taxes(tax_ids);
            } else {
                order.orderlines.models.forEach(l => {
                    l.set_taxes(tax_ids)
                })
            }
        }


    }

    OrderCartAction.template = 'OrderCartAction';

    Registries.Component.add(OrderCartAction);

    return OrderCartAction;
});
