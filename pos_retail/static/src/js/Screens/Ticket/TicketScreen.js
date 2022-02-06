odoo.define('pos_retail.TicketScreen', function (require) {
    'use strict';
    const TicketScreen = require('point_of_sale.TicketScreen');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const {posbus} = require('point_of_sale.utils');
    const BarcodeEvents = require('barcodes.BarcodeEvents').BarcodeEvents;
    const NumberBuffer = require('point_of_sale.NumberBuffer');

    const RetailTicketScreen = (TicketScreen) =>
        class extends TicketScreen {
            constructor() {
                super(...arguments);
                NumberBuffer.use({
                    nonKeyboardInputEvent: 'numpad-click-input',
                    triggerAtInput: 'update-selected-orderline',
                    triggerTicketScreen: 'trigger-ticket-screen',
                });
                useListener('trigger-ticket-screen', this._keyboardHandler);
            }


            _keyboardHandler(event) {
                const keyName = event.detail.key
                console.log('[ Key enter ] : ' + keyName)
                if (keyName == "r") {
                    let selectedOrder = this.env.pos.get_order();
                    this._onDeleteOrder({detail: selectedOrder})
                }
                if (keyName == "b" || keyName == "Escape") {
                    $(this.el).find('.discard').click()
                }
                if (keyName == "f") {
                    $(this.el).find('.filter').click()
                }
                if (keyName == "n") {
                    this._onCreateNewOrder()
                }
                if (keyName == "s") {
                    $(this.el).find('.search >input').focus()
                }
            }


            getTable(order) {
                if (order.table) {
                    return super.getTable(order)
                } else {
                    return 'N/A'
                }
            }

            async _onCreateNewOrder() {
                if (this.env.pos.config.validate_new_order) {
                    let validate = await this.env.pos._validate_action(this.env._t('Need approve create new Order'));
                    if (!validate) {
                        return false;
                    }
                }
                return super._onCreateNewOrder()
            }

            async removeAllOrders() {
                let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Warning'),
                    body: this.env._t('Are you sure remove all Orders ?')
                })
                if (confirmed) {
                    if (this.env.pos.config.validate_remove_order) {
                        let validate = await this.env.pos._validate_action(this.env._t('Need approve delete Order'));
                        if (!validate) {
                            return false;
                        }
                    }
                    const orders = this.env.pos.get('orders').models;
                    for (let i = 0; i < orders.length; i++) {
                        this.env.pos.saveOrderRemoved(orders[i])
                    }
                    orders.forEach(o => o.destroy({'reason': 'abandon'}))
                    orders.forEach(o => o.destroy({'reason': 'abandon'}))
                    orders.forEach(o => o.destroy({'reason': 'abandon'}))
                }
            }

            async _onDeleteOrder({detail: order}) {
                if (this.env.pos.config.validate_remove_order && !order['temporary']) {
                    let validate = await this.env.pos._validate_action(this.env._t('Need approve delete Order'));
                    if (!validate) {
                        return false;
                    }
                }
                await super._onDeleteOrder({detail: order});
                this.env.pos.saveOrderRemoved(order)
            }

            get orderList() {
                return this.env.pos.get('orders').models;
            }

            shouldHideDeleteButton(order) {
                if (!this.env.pos.config.allow_remove_order) {
                    return false
                } else {
                    return super.shouldHideDeleteButton(order)
                }
            }

            async saveToPartialOrder(selectedOrder) {
                let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert'),
                    body: this.env._t("Are you want save current Order to Draft Order ?"),
                })
                if (confirmed) {
                    if (selectedOrder.get_total_with_tax() <= 0 || selectedOrder.orderlines.length == 0) {
                        return this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: this.env._t('Order has Empty Cart or Amount Total smaller than or equal 0')
                        })
                    }
                    const linePriceSmallerThanZero = selectedOrder.orderlines.models.find(l => l.get_price_with_tax() <= 0 && !l.promotion)
                    if (this.env.pos.config.validate_return && linePriceSmallerThanZero) {
                        let validate = await this.env.pos._validate_action(this.env._t('Have one Line has Price smaller than or equal 0. Need Manager Approve'));
                        if (!validate) {
                            return false;
                        }
                    }
                    if (this.env.pos.config.validate_payment) {
                        let validate = await this.env.pos._validate_action(this.env._t('Need Approve Payment'));
                        if (!validate) {
                            return false;
                        }
                    }
                    let lists = this.env.pos.payment_methods.filter((p) => (p.journal && p.pos_method_type && p.pos_method_type == 'default') || (!p.journal && !p.pos_method_type)).map((p) => ({
                        id: p.id,
                        item: p,
                        label: p.name
                    }))
                    let {confirmed, payload: paymentMethod} = await this.showPopup('SelectionPopup', {
                        title: this.env._t('Save Order to Partial Order, Please select one Payment Method !!'),
                        list: lists
                    })
                    if (confirmed) {
                        let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                            title: this.env._t('How much Amount Customer need Paid ? Total Amount Order is: ') + this.env.pos.format_currency(selectedOrder.get_total_with_tax()),
                            startingValue: 0
                        })
                        if (confirmed) {
                            this.selectOrder(selectedOrder)
                            number = parseFloat(number)
                            if (number < 0 || number > selectedOrder.get_total_with_tax()) {
                                return this.showPopup('ErrorPopup', {
                                    title: this.env._t('Warning'),
                                    body: this.env._t('Your register Amount bigger than Total Amount Order, Required smaller than or equal Total Amount Order')
                                })
                            }
                            if (number > 0) {
                                let paymentLines = selectedOrder.paymentlines.models
                                paymentLines.forEach(function (p) {
                                    selectedOrder.remove_paymentline(p)
                                })
                                selectedOrder.add_paymentline(paymentMethod);
                                let paymentline = selectedOrder.selected_paymentline;
                                paymentline.set_amount(number);
                                selectedOrder.trigger('change', selectedOrder);
                            }
                            this.env.pos.push_single_order(selectedOrder, {
                                draft: true
                            })
                            this.showPopup('TextInputPopup', {
                                title: this.env._t('Receipt Number: ') + selectedOrder['name'],
                                startingValue: selectedOrder['name'],
                                confirmText: this.env._t('Ok'),
                                cancelText: this.env._t('Close'),
                            });
                            return this.showScreen('ReceiptScreen');
                        }
                    }
                }
            }
        }
    Registries.Component.extend(TicketScreen, RetailTicketScreen);

    return RetailTicketScreen;
});
