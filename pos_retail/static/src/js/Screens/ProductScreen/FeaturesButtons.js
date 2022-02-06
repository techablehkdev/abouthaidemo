odoo.define('pos_retail.FeatureButtons', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {Printer} = require('point_of_sale.Printer');
    const OrderReceipt = require('point_of_sale.OrderReceipt');
    const field_utils = require('web.field_utils');
    const {useListener} = require('web.custom_hooks');
    const {useState} = owl.hooks;

    class FeatureButtons extends PosComponent {
        constructor() {
            super(...arguments);
            this._currentOrder = this.env.pos.get_order();
            if (this._currentOrder) {
                this._currentOrder.orderlines.on('change', this._totalWillPaid, this);
                this._currentOrder.orderlines.on('remove', this._totalWillPaid, this);
                this._currentOrder.paymentlines.on('change', this._totalWillPaid, this);
                this._currentOrder.paymentlines.on('remove', this._totalWillPaid, this);
                this.env.pos.on('change:selectedOrder', this._updateCurrentOrder, this);
            }
            this.state = useState({
                total: 0,
                tax: 0,
                due: 0,
                processing: 'done',
                message: ''
            });
            this._totalWillPaid()
            useListener('print-receipt', this.printReceipt);
        }

        get client() {
            if (this._currentOrder) {
                return this._currentOrder.get_client()
            } else {
                return null
            }
        }

        get isLongName() {
            let selectedOrder = this._currentOrder
            if (selectedOrder && selectedOrder.get_client()) {
                return selectedOrder.get_client() && selectedOrder.get_client().name.length > 10;
            } else {
                return false
            }
        }

        get isCustomerSet() {
            let selectedOrder = this._currentOrder
            if (selectedOrder && selectedOrder.get_client()) {
                return true
            } else {
                return false
            }
        }

        willUnmount() {
            if (this._currentOrder) {
                this._currentOrder.orderlines.off('change', null, this);
                this._currentOrder.paymentlines.off('change', null, this);
            }
            this.env.pos.off('change:selectedOrder', null, this);
        }

        _updateCurrentOrder(pos, newSelectedOrder) {
            this._currentOrder.orderlines.off('change', null, this);
            if (newSelectedOrder) {
                this._currentOrder = newSelectedOrder;
                this._currentOrder.orderlines.on('change', this.render, this);
            }
        }

        get client() {
            return this.env.pos.get_client();
        }

        get getClientName() {
            if (this.env.pos.get_order()) {
                const selectedOrder = this.env.pos.get_order()
                if (selectedOrder.get_client()) {
                    return selectedOrder.get_client().display_name
                } else {
                    return this.env._t('Customer')
                }
            } else {
                return this.env._t('Customer')
            }
        }

        async partialPaymentOrder() {
            const selectedOrder = this.env.pos.get_order();
            if (selectedOrder.orderlines.length == 0) {
                return this.env.pos.chrome.showNotification(this.env._t('Error'), this.env._t('Your Order Cart is Blank'))
            }
            let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                title: this.env._t('Please Confirm ?'),
                body: this.env._t("Are you want do Partial Payment Current Order ?"),
            })
            if (confirmed) {
                if (!this.env.pos.config.allow_order_out_of_stock) {
                    const quantitiesByProduct = selectedOrder.product_quantity_by_product_id()
                    let isValidStockAllLines = true;
                    for (let n = 0; n < selectedOrder.orderlines.models.length; n++) {
                        let l = selectedOrder.orderlines.models[n];
                        let currentStockInCart = quantitiesByProduct[l.product.id]
                        if (l.product.type == 'product' && l.product.qty_available < currentStockInCart) {
                            isValidStockAllLines = false
                            this.env.pos.alert_message({
                                title: this.env._t('Error'),
                                body: l.product.display_name + this.env._t(' not enough for sale. Current stock on hand only have: ') + l.product.qty_available,
                                timer: 10000
                            })
                        }
                    }
                    if (!isValidStockAllLines) {
                        return false;
                    }
                }
                let hasValidMinMaxPrice = selectedOrder.isValidMinMaxPrice()
                if (!hasValidMinMaxPrice) {
                    return false
                }
                const linePriceSmallerThanZero = selectedOrder.orderlines.models.find(l => l.get_price_with_tax() <= 0 && !l.promotion)
                if (this.env.pos.config.validate_return && linePriceSmallerThanZero) {
                    let validate = await this.env.pos._validate_action(this.env._t('Have one Line has Price smaller than or equal 0. Need Manager Approve'));
                    if (!validate) {
                        return this.env.pos.chrome.showNotification(this.env._t('Warning'), this.env._t('Your POS active Validate Return, need Manager Approve'))
                    }
                }
                if (this.env.pos.config.validate_payment) {
                    let validate = await this.env.pos._validate_action(this.env._t('Need approve Payment'));
                    if (!validate) {
                        return this.env.pos.chrome.showNotification(this.env._t('Warning'), this.env._t('Your POS active Validate Payment, need Manager Approve'))
                    }
                }
                if (selectedOrder.get_total_with_tax() <= 0 || selectedOrder.orderlines.length == 0) {
                    return this.env.pos.chrome.showNotification(this.env._t('Warning'), this.env._t('It not possible Total Paid smaller than 0'))
                }
                if (!selectedOrder.get_client()) {
                    this.showPopup('ConfirmPopup', {
                        title: this.env._t('Partial Order required Customer'),
                        body: this.env._t('Please set a Customer'),
                        disableCancelButton: true,
                    })
                    const {confirmed, payload: newClient} = await this.showTempScreen(
                        'ClientListScreen',
                        {client: null, body: this.env._t('Required Customer')}
                    );
                    if (confirmed) {
                        selectedOrder.set_client(newClient);
                    } else {
                        return this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: this.env._t('Required set Customer for Partial Order')
                        })
                    }
                }
                let lists = this.env.pos.payment_methods.filter((p) => (p.journal && p.pos_method_type && p.pos_method_type == 'default') || (!p.journal && !p.pos_method_type)).map((p) => ({
                    id: p.id,
                    item: p,
                    label: p.name
                }))
                let {confirmed, payload: paymentMethod} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('Are you want Register one Part Amount of Total Order'),
                    list: lists
                })
                if (confirmed) {
                    let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                        title: this.env._t('How much Customer need Register Payment ?'),
                        startingValue: 0
                    })
                    if (confirmed) {
                        number = parseFloat(number)
                        if (number < 0) {
                            return this.showPopup('ErrorPopup', {
                                title: this.env._t('Error'),
                                body: this.env._t('Register Amount required Bigger than 0')
                            })
                        }
                        if (number > 0) { // TODO: only amount > 0, allow register payment
                            let paymentLines = selectedOrder.paymentlines.models
                            paymentLines.forEach(function (p) {
                                selectedOrder.remove_paymentline(p)
                            })
                            selectedOrder.add_paymentline(paymentMethod);
                            let paymentline = selectedOrder.selected_paymentline;
                            paymentline.set_amount(number);
                            selectedOrder.trigger('change', selectedOrder);
                        }
                        let order_ids = this.env.pos.push_single_order(selectedOrder, {
                            draft: true
                        })
                        this.showPopup('TextInputPopup', {
                            title: this.env._t('Partial Order Receipt Number: ') + selectedOrder['name'],
                            startingValue: selectedOrder['name'],
                            confirmText: this.env._t('Ok'),
                            cancelText: this.env._t('Close'),
                        });
                        return this.showScreen('ReceiptScreen');
                    }
                } else {
                    let order_ids = this.env.pos.push_single_order(selectedOrder, {
                        draft: true
                    })
                    this.showPopup('TextInputPopup', {
                        title: this.env._t('Partial Order Receipt Number: ') + selectedOrder['name'],
                        startingValue: selectedOrder['name'],
                        confirmText: this.env._t('Ok'),
                        cancelText: this.env._t('Close'),
                    });
                    return this.showScreen('ReceiptScreen');
                }
            }
        }

        async sendReceiptViaWhatsApp() {
            let fixture = document.createElement('div');
            const printer = new Printer();
            const order = this.env.pos.get_order()
            const orderReceipt = new (Registries.Component.get(OrderReceipt))(this, {order});
            await orderReceipt.mount(fixture);
            const receiptString = orderReceipt.el.outerHTML;
            const ticketImage = await printer.htmlToImg(receiptString);

            if (!order || order.get_orderlines().length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Your order is blank cart'),
                })
            }
            const client = order.get_client();
            let mobile_no = '';
            if (!client || (!client['mobile'] && !client['phone'])) {
                let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                    title: this.env._t("Order have not set Client or Client null Phone/Mobile. Please input Client's Mobile for send Receipt"),
                    startingValue: 0
                })
                if (confirmed) {
                    mobile_no = number
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t("Mobile Number is required"),
                        disableCancelButton: true,
                    })
                }
            } else {
                mobile_no = client.mobile || client.phone
            }
            let message = this.env.pos.config.whatsapp_message_receipt + ' ' + order['name'];
            let {confirmed, payload: messageNeedSend} = await this.showPopup('TextAreaPopup', {
                title: this.env._t('What message need to send Client ?'),
                startingValue: message
            })
            if (confirmed) {
                message = messageNeedSend
            }

            if (mobile_no) {
                let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Please review Mobile Number'),
                    body: mobile_no + this.env._t(" will use for send the Receipt, are you sure ? If you need change, please click Cancel button"),
                })
                if (confirmed) {
                    let responseOfWhatsApp = await this.rpc({
                        model: 'pos.config',
                        method: 'send_receipt_via_whatsapp',
                        args: [[], this.env.pos.config.id, ticketImage, mobile_no, message],
                    }, {
                        shadow: true,
                        timeout: 60000
                    });
                    if (responseOfWhatsApp && responseOfWhatsApp['id']) {
                        return this.showPopup('ConfirmPopup', {
                            title: this.env._t('Successfully'),
                            body: this.env._t("Receipt send successfully to your Client's Phone WhatsApp: ") + mobile_no,
                            disableCancelButton: true,
                        })
                    } else {
                        return this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: this.env._t("Send Receipt is fail, please check WhatsApp API and Token of your pos config or Your Server turn off Internet"),
                            disableCancelButton: true,
                        })
                    }
                } else {
                    let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                        title: this.env._t("Please input WhatsApp Client's Mobile ?"),
                        startingValue: 0
                    })
                    if (confirmed) {
                        mobile_no = number
                        let responseOfWhatsApp = await this.rpc({
                            model: 'pos.config',
                            method: 'send_receipt_via_whatsapp',
                            args: [[], this.env.pos.config.id, ticketImage, mobile_no, message],
                        }, {
                            shadow: true,
                            timeout: 60000
                        });
                        if (responseOfWhatsApp && responseOfWhatsApp['id']) {
                            return this.showPopup('ConfirmPopup', {
                                title: this.env._t('Successfully'),
                                body: this.env._t("Receipt send successfully to your Client's Phone WhatsApp: ") + mobile_no,
                                disableCancelButton: true,
                            })
                        } else {
                            return this.env.pos.alert_message({
                                title: this.env._t('Error'),
                                body: this.env._t("Send Receipt is fail, please check WhatsApp API and Token of your pos config or Your Server turn off Internet"),
                                disableCancelButton: true,
                            })
                        }
                    }
                }
            } else {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t("Mobile Number is required"),
                    disableCancelButton: true,
                })
            }
        }

        async setServicesOrder() {
            const selectedOrder = this.env.pos.get_order();
            if (selectedOrder.orderlines.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your order cart is blank')
                })
            }
            const list = this.env.pos.services_charge.map(service => ({
                id: service.id,
                name: service.name,
                item: service
            }))
            let {confirmed, payload: selectedItems} = await this.showPopup(
                'PopUpSelectionBox',
                {
                    title: this.env._t('Please select one Service need add to Order'),
                    items: list,
                    onlySelectOne: true,
                }
            );
            if (confirmed && selectedItems['items'].length > 0) {
                const service = selectedItems['items'][0]['item']
                var product = this.env.pos.db.get_product_by_id(service['product_id'][0]);
                if (product) {
                    selectedOrder.add_shipping_cost(service, product, false)
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: service['product_id'][1] + this.env._t(' not available in POS. Please set this product available in POS before use this feature')
                    })
                }
            }
        }

        async signatureOrder() {
            const order = this.env.pos.get_order();
            const {confirmed, payload: values} = await this.showPopup('PopUpSignatureOrder', {
                title: this.env._t('Signature Order'),
            })
            if (confirmed) {
                if (!values.signature) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('Signature not success, please try again')
                    })
                } else {
                    order.set_signature(values.signature)
                }
            }
        }

        get nGuests() {
            const order = this.env.pos.get_order();
            return order ? order.get_customer_count() : 0;
        }

        async setGuests() {
            const {confirmed, payload: inputNumber} = await this.showPopup('NumberPopup', {
                startingValue: this.nGuests,
                cheap: true,
                title: this.env._t('Guests ?'),
            });

            if (confirmed) {
                this.env.pos.get_order().set_customer_count(parseInt(inputNumber, 10) || 1);
            }
        }

        async transferItemsToAnotherTable() {
            const order = this.env.pos.get_order();
            if (order.get_orderlines().length > 0) {
                this.showScreen('SplitBillScreen');
                this.showPopup('ConfirmPopup', {
                    title: this.env._t('Please select Minimum 1 Item'),
                    body: this.env._t('And click to button "Transfer to another Table"'),
                    disableCancelButton: true,
                })
            }
        }

        async lockTable() {
            const selectedOrder = this.env.pos.get_order()
            const orders = this.env.pos.get('orders').models;
            let {confirmed, payload: selection} = await this.showPopup('SelectionPopup', {
                title: this.env._t('Selection Lock Type'),
                list: [
                    {
                        label: this.env._t('Only lock selected Order'),
                        item: true,
                        id: 1,
                    },
                    {
                        label: this.env._t('Lock all Orders have Items in Cart'),
                        item: false,
                        id: 2,
                    }
                ],
            })
            if (confirmed) {
                if (selection) {
                    return selectedOrder.lock_order()
                } else {
                    for (let i = 0; i < orders.length; i++) {
                        orders[i].lock_order()
                    }
                }
            }
        }

        get orderAutoPrintText() {
            if (this.env.pos.config.iface_print_auto) {
                return this.env._t('[On] Auto Print and Next Order')
            } else {
                return this.env._t('[Off] Auto Print and Next Order')
            }
        }

        get orderAutoPrint() {
            if (this.env.pos.config.iface_print_auto) {
                return true
            } else {
                return false
            }
        }

        async setAutoPrint() {
            if (this.env.pos.config.validate_order_without_receipt != this.env.pos.config.iface_print_auto) {
                this.env.pos.config.validate_order_without_receipt = true
                this.env.pos.config.iface_print_auto = true
            }
            this.env.pos.config.validate_order_without_receipt = !this.env.pos.config.validate_order_without_receipt
            this.env.pos.config.iface_print_auto = !this.env.pos.config.iface_print_auto
            if (this.env.pos.config.iface_print_auto) {
                this.env.pos.alert_message({
                    title: this.env._t('ON'),
                    body: this.env._t('Automatic Print Receipt, Validate and Next Order is [ON]'),
                    color: 'success'
                })
            } else {
                this.env.pos.alert_message({
                    title: this.env._t('OFF'),
                    body: this.env._t('Automatic Print Receipt, Validate and Next Order is [OFF]'),
                })
            }
            this.render()
        }

        async selectLoyaltyReward() {
            const selectedOrder = this.env.pos.get_order();
            var client = selectedOrder.get_client();
            if (!client) {
                const {confirmed, payload: newClient} = await this.env.pos.chrome.showTempScreen(
                    'ClientListScreen',
                    {client: null, body: this.env._t('Required Customer')}
                );
                if (confirmed) {
                    selectedOrder.set_client(newClient);
                } else {
                    const {confirmed, payload: confirm} = await this.env.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('Customer is required set to Order for checking points existing of Customer')
                    })
                    if (confirmed) {
                        const {confirmed, payload: newClient} = await this.env.pos.chrome.showTempScreen(
                            'ClientListScreen',
                            {client: null, body: this.env._t('Required Customer')}
                        )
                        if (confirmed) {
                            selectedOrder.set_client(newClient);
                            return await this.selectLoyaltyReward()
                        }
                    }
                }

            }
            const list = this.env.pos.rewards.map(reward => ({
                id: reward.id,
                label: reward.name,
                isSelected: false,
                item: reward
            }))
            let {confirmed, payload: reward} = await this.env.pos.chrome.showPopup('SelectionPopup', {
                title: this.env._t('Please select one Reward need apply to customer'),
                list: list,
            });
            if (confirmed) {
                selectedOrder.setRewardProgram(reward)
            }
        }

        get currentPricelistName() {
            const order = this.env.pos.get_order();
            return order && order.pricelist
                ? order.pricelist.display_name
                : this.env._t('Pricelist');
        }

        get orderToInvoice() {
            if (this._currentOrder && this._currentOrder.is_to_invoice()) {
                return true
            } else {
                return false
            }
        }

        get getStateToInvoiceString() {
            if (this._currentOrder.is_to_invoice()) {
                return this.env._t('Auto Invoice On')
            } else {
                return this.env._t('Auto Invoice Off')
            }
        }

        _totalWillPaid() {
            const total = this._currentOrder ? this._currentOrder.get_total_with_tax() : 0;
            const due = this._currentOrder ? this._currentOrder.get_due() : 0;
            const tax = this._currentOrder ? total - this._currentOrder.get_total_without_tax() : 0;
            this.state.total = this.env.pos.format_currency(total);
            this.state.due = this.env.pos.format_currency(due);
            this.state.tax = this.env.pos.format_currency(tax);
            this.render();
        }

        async printReceipt() {
            if (!this.env.pos.config.review_receipt_before_paid) {
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Your POS have not active Print Receipt Before Payment, please contact your Admin !!!')
                })
            }
            const order = this.env.pos.get_order();
            if (!order) return;
            if (order.orderlines.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your order cart is blank')
                })
            }
            const changes = this._currentOrder.hasChangesToPrint(); // TODO: Only for Restaurant, when cashier get draft bill, we print all request to printer
            order.orderlines.models.forEach(l => { // TODO: set skipped to fail
                if (l.mp_dbclk_time != 0 && l.mp_skip) {
                    this.mp_dbclk_time = 0
                    l.set_skip(false) // skipped is Product is Main Course
                }
            })
            let printers = this.env.pos.printers;
            let orderRequest = null
            for (let i = 0; i < printers.length; i++) {
                let printer = printers[i];
                let changes = order.computeChanges(printer.config.product_categories_ids);
                if (changes['new'].length > 0 || changes['cancelled'].length > 0) {
                    let orderReceipt = order.buildReceiptKitchen(changes);
                    orderRequest = orderReceipt
                    order.saveChanges();
                    if ((order.syncing == false || !order.syncing) && this.env.pos.pos_bus && !this.env.pos.splitbill) {
                        this.env.pos.pos_bus.requests_printers.push({
                            action: 'request_printer',
                            data: {
                                uid: order.uid,
                                computeChanges: orderReceipt,
                            },
                            order_uid: order.uid,
                        })
                    }
                }
            }
            const fixture = document.createElement('div');
            const orderReceipt = new (Registries.Component.get(OrderReceipt))(null, {order, orderRequest});
            await orderReceipt.mount(fixture);
            const receiptHtml = orderReceipt.el.outerHTML;
            this.showScreen('ReportScreen', {
                report_html: receiptHtml,
                report_xml: null,
            });
        }

        async quicklyPaidOrder() {
            const self = this;
            const selectedOrder = this.env.pos.get_order();
            if (selectedOrder.orderlines.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your order cart is blank')
                })
            }
            if (!this.env.pos.config.allow_order_out_of_stock) {
                const quantitiesByProduct = selectedOrder.product_quantity_by_product_id()
                let isValidStockAllLines = true;
                for (let n = 0; n < selectedOrder.orderlines.models.length; n++) {
                    let l = selectedOrder.orderlines.models[n];
                    let currentStockInCart = quantitiesByProduct[l.product.id]
                    if (l.product.type == 'product' && l.product.qty_available < currentStockInCart) {
                        isValidStockAllLines = false
                        this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: l.product.display_name + this.env._t(' not enough for sale. Current stock on hand only have: ') + l.product.qty_available,
                            timer: 10000
                        })
                    }
                }
                if (!isValidStockAllLines) {
                    return false;
                }
            }
            if (selectedOrder.is_to_invoice() && !selectedOrder.get_client()) {
                this.showPopup('ConfirmPopup', {
                    title: this.env._t('Warning'),
                    body: this.env._t('Order will process to Invoice, please select one Customer for set to current Order'),
                    disableCancelButton: true,
                })
                const {confirmed, payload: newClient} = await this.showTempScreen(
                    'ClientListScreen',
                    {client: null, body: this.env._t('Required Customer')}
                );
                if (confirmed) {
                    selectedOrder.set_client(newClient);
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Order will processing to Invoice, required set a Customer')
                    })
                }
            }
            let hasValidMinMaxPrice = selectedOrder.isValidMinMaxPrice()
            if (!hasValidMinMaxPrice) {
                return false
            }
            const linePriceSmallerThanZero = selectedOrder.orderlines.models.find(l => l.get_price_with_tax() <= 0 && !l.promotion)
            if (this.env.pos.config.validate_return && linePriceSmallerThanZero) {
                let validate = await this.env.pos._validate_action(this.env._t('Have one Line has Price smaller than or equal 0. Need Manager Approve'));
                if (!validate) {
                    return false;
                }
            }
            if (this.env.pos.config.validate_payment) {
                let validate = await this.env.pos._validate_action(this.env._t('Need approve Payment'));
                if (!validate) {
                    return false;
                }
            }
            if (selectedOrder.get_total_with_tax() <= 0 || selectedOrder.orderlines.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your Order is Empty or Total Amount smaller or equal 0')
                })
            }
            if (!this.env.pos.config.quickly_payment_method_id) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your POS Config not set Quickly Payment Method, please go to Tab [Payment Screen] of POS Config and full fill to [Quickly Payment with Method]')
                })
            }
            let quickly_payment_method = this.env.pos.payment_methods.find(m => m.id == this.env.pos.config.quickly_payment_method_id[0])
            if (!quickly_payment_method) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('You POS Config active Quickly Paid but not set add Payment Method: ') + this.env.pos.config.quickly_payment_method_id[1] + this.env._t('Payments/ Payment Methods')
                })
            }
            let paymentLines = selectedOrder.paymentlines.models
            paymentLines.forEach(function (p) {
                selectedOrder.remove_paymentline(p)
            })
            selectedOrder.add_paymentline(quickly_payment_method);
            var paymentline = selectedOrder.selected_paymentline;
            paymentline.set_amount(selectedOrder.get_total_with_tax());
            selectedOrder.trigger('change', selectedOrder);
            const validate_order_without_receipt = this.env.pos.config.validate_order_without_receipt;
            const iface_print_auto = this.env.pos.config.iface_print_auto;
            this.env.pos.config.validate_order_without_receipt = true
            this.env.pos.config.iface_print_auto = true
            let order_ids = this.env.pos.push_single_order(selectedOrder, {})
            console.log('[quicklyPaidOrder] pushed succeed order_ids: ' + order_ids)
            this.showScreen('ReceiptScreen');
            setTimeout(function () {
                self.env.pos.config.validate_order_without_receipt = validate_order_without_receipt
                self.env.pos.config.iface_print_auto = iface_print_auto
            }, 2000)
        }

        // async autoAskCashierNeedCache() {
        //     let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
        //         title: this.env._t('Are you want Active [Turbo Starting POS Screen] !!!'),
        //         body: this.env._t('All Datas used on POS loaded from Odoo Backend will save to Your Browse Device, it can help you Quickly Resume your POS Session (or f5 POS Web page). If have any changes have linked to your POS, please click to [Sync Backend] near numpad button, for re-update your POS Cache')
        //     })
        //     if (confirmed) {
        //         await this.rpc({
        //             model: 'pos.config',
        //             method: 'write',
        //             args: [[this.env.pos.config.id], {
        //                 'cache': 'browse'
        //             }],
        //         })
        //     } else {
        //         return true
        //     }
        // }

        async sendInput(key) {
            const selectedOrder = this.env.pos.get_order();
            if (key == 'ClearCart') {
                if (selectedOrder.orderlines.models.length > 0) {
                    let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                        title: this.env._t('Warning !!!'),
                        body: this.env._t('Are you want remove all Items in Cart ?')
                    })
                    if (confirmed) {
                        selectedOrder.orderlines.models.forEach(l => selectedOrder.remove_orderline(l))
                        selectedOrder.orderlines.models.forEach(l => selectedOrder.remove_orderline(l))
                        selectedOrder.orderlines.models.forEach(l => selectedOrder.remove_orderline(l))
                        selectedOrder.orderlines.models.forEach(l => selectedOrder.remove_orderline(l))
                        selectedOrder.is_return = false;
                        this.env.pos.alert_message({
                            title: this.env._t('Successfully'),
                            body: this.env._t('Order is empty cart !')
                        })
                    }
                } else {
                    this.env.pos.alert_message({
                        title: this.env._t('Warning !!!'),
                        body: this.env._t('Your Order Cart is blank.')
                    })
                }

            }
            if (key == 'GlobalDisc') {
                if (selectedOrder.orderlines.length == 0) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Your order cart is blank')
                    })
                }
                if (selectedOrder.is_return) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('It not possible add Global Dicsount for Order Return')
                    })
                }
                selectedOrder.clear_discount_extra()
                const list = this.env.pos.discounts.map(discount => ({
                    id: discount.id,
                    name: discount.name,
                    item: discount,
                }))
                let {confirmed, payload: selectedItems} = await this.showPopup(
                    'PopUpSelectionBox',
                    {
                        title: this.env._t('All Global Discount removed, Please select one Disc need Apply ?'),
                        items: list,
                        onlySelectOne: true,
                        cancelButtonText: this.env._t('Close'),
                        confirmButtonText: this.env._t('Confirm'),
                    }
                );
                if (confirmed) {
                    const discountItem = selectedItems.items[0]['item']
                    if (this.env.pos.config.validate_discount_change) {
                        let validate = await this.env.pos._validate_action(this.env._t('Need Add Global Discount: ' + discountItem['name']));
                        if (!validate) {
                            return false;
                        }
                    }
                    selectedOrder.add_global_discount(discountItem)
                }
            }
            if (key == 'DiscValue') {
                if (selectedOrder.orderlines.length == 0) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Your order cart is blank')
                    })
                }
                let {confirmed, payload: discount} = await this.showPopup('NumberPopup', {
                    title: this.env._t('Which value of discount Value would you apply to Order ?'),
                    startingValue: 0,
                    confirmText: this.env._t('Apply Discount'),
                    cancelText: this.env._t('Remove all Discount'),
                })
                if (confirmed) {
                    selectedOrder.set_discount_value(parseFloat(discount))
                }
            }
            if (key == 'SetNotes') {
                const {confirmed, payload: note} = await this.showPopup('TextAreaPopup', {
                    title: this.env._t('Set Notes to Order'),
                    startingValue: selectedOrder.get_note()
                })
                if (confirmed) {
                    selectedOrder.set_note(note)
                }
            }
            if (key == 'QuicklyPaid') {
                await this.quicklyPaidOrder()
            }
            if (key == 'ReturnMode') {
                await this.changeToReturnMode()
                this.render()
            }
            if (key == 'onOfInvoice') {
                selectedOrder.set_to_invoice(!selectedOrder.is_to_invoice());
                if (selectedOrder.is_to_invoice() && !selectedOrder.get_client()) {
                    this.env.pos.chrome.showNotification(this.env._t('Required !!!'), this.env._t(' Please select Customer for make a Invoice'))
                    const {confirmed, payload: newClient} = await this.showTempScreen(
                        'ClientListScreen',
                        {client: null, body: this.env._t('Required Customer')}
                    );
                    if (confirmed) {
                        this.env.pos.alert_message({
                            title: this.env._t('Order to Invoice is ON'),
                            body: this.env._t('Order will create Invoice')
                        })
                        selectedOrder.set_client(newClient);
                    } else {
                        this.env.pos.alert_message({
                            title: this.env._t('Order to Invoice is OFF'),
                            body: this.env._t('Order submit without Invoice')
                        })
                        selectedOrder.set_to_invoice(false)
                    }
                } else {
                    this.env.pos.chrome.showNotification(this.env._t('Invoice Off !!!'), this.env._t('Turn Off make Order to Invoice'))
                }
                this.env.pos.config.auto_invoice = selectedOrder.is_to_invoice()
                this.render()
            }
            if (key == 'CashControl') {
                this.cashInOut()
            }
            if (key == 'setStartCategory') {
                const pos_categories = this.env.pos.pos_categories.map(categ => ({
                    id: categ.id,
                    label: categ.name,
                    isSelected: false,
                    item: categ
                }))
                pos_categories.push({
                    id: 0,
                    label: this.env._t('All Categories'),
                    isSelected: false,
                    item: null
                })
                let {confirmed, payload: categ} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('Please select one Category for Start Sale'),
                    body: this.env._t('Default auto display Products have Category the same with your selected .'),
                    list: pos_categories
                })
                if (confirmed) {
                    if (categ) {
                        await this.rpc({
                            model: 'pos.config',
                            method: 'write',
                            args: [[this.env.pos.config.id], {
                                'start_category': true,
                                'iface_start_categ_id': categ.id
                            }],
                        })
                    } else {
                        await this.rpc({
                            model: 'pos.config',
                            method: 'write',
                            args: [[this.env.pos.config.id], {
                                'start_category': false,
                                'iface_start_categ_id': null
                            }],
                        })
                    }
                    this.env.pos.reload_pos()

                }
            }

            // if (key == 'syncBackEnd') {
            //     let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
            //         title: this.env._t('POS Screen will block for sync products and customers few times.'),
            //         body: this.env._t('Are you ready want do it now ?'),
            //         confirmText: this.env._t('Ok'),
            //         cancelText: this.env._t('Close')
            //     })
            //     if (confirmed) {
            //         const serverOrigin = this.env.pos.session.origin;
            //         const connection = new Session(void 0, serverOrigin, {
            //             use_cors: true
            //         });
            //         const pingServer = await connection.rpc('/pos/passing/login', {}).then(function (result) {
            //             return result
            //         }, function (error) {
            //             return false;
            //         })
            //         if (!pingServer) {
            //             return this.showPopup('ErrorPopup', {
            //                 title: this.env._t('Odoo Server Offline'),
            //                 body: this.env._t('Your internet or Odoo server Offline, not possible refresh POS Database Cache')
            //             })
            //         }
            //         this.state.processing = 'starting'
            //         this.env.pos.set_synch('connecting', 'Syncing Database')
            //         await this.env.pos.syncProductsPartners()
            //         // this.render()
            //         // // remove all call logs and cache logs of backend
            //         // await this.rpc({
            //         //     model: 'pos.query.log',
            //         //     method: 'clearLogs',
            //         //     args: [[]],
            //         // })
            //         // // remove cache browse
            //         // indexedDB.deleteDatabase(odoo.session_info.db + '_master_DB');
            //         if (this.env.pos.config.cache == 'iot') {
            //             const iotUrl = 'http://' + odoo.proxy_ip + ':8069'
            //             const iotConnection = new Session(void 0, iotUrl, {
            //                 use_cors: true
            //             });
            //             await iotConnection.rpc('/hw_cache/reset', {})
            //         }
            //         // remove pos database, next starting pos will reinstall all pos query logs
            //         // this.env.pos.remove_indexed_db()
            //         // this.env.pos.reload_pos()
            //         this.state.processing = 'done'
            //     }
            // }
            if (key == 'setSeller') {
                const order = this.env.pos.get_order();
                if (!order || !order.get_selected_orderline()) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Your order is blank cart')
                    })
                }
                const list = this.env.pos.sellers.map(seller => ({
                    id: seller.id,
                    label: seller.name,
                    isSelected: false,
                    item: seller
                }))
                let {confirmed, payload: seller} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('Please select one Seller'),
                    list: list
                })
                if (confirmed) {
                    order.get_selected_orderline().set_sale_person(seller)
                }
            }
            if (key == 'AutoRecommendations') {
                let product_recommendation = this.env.pos.config.product_recommendation
                let product_recommendation_number = this.env.pos.config.product_recommendation_number
                if (!product_recommendation) {
                    let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                        title: this.env._t('Are you want Active: [Products Recommendation] ?'),
                        body: this.env._t('Example: normally customer bought Product A, may be them like Product B,C,D ... together, Products screen auto display Product B,C,D ... for easy add fast to cart')
                    })
                    if (confirmed) {
                        product_recommendation = true
                    } else {
                        product_recommendation = false
                    }
                } else {
                    let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                        title: this.env._t('Are you want Disable: [Products Recommendation] ?'),
                        body: this.env._t('Products Recommendation will Off if you confirm OK button !')
                    })
                    if (confirmed) {
                        product_recommendation = false
                    } else {
                        product_recommendation = true
                    }
                }
                if (product_recommendation) {
                    let {confirmed, payload: count} = await this.showPopup('NumberPopup', {
                        title: this.env._t('How many products will display for Recomment ?'),
                        startingValue: 20
                    })
                    if (confirmed) {
                        product_recommendation_number = parseInt(count)
                    }
                }
                if (product_recommendation_number >= 100) {
                    product_recommendation_number = 100
                }
                await this.rpc({
                    model: 'pos.config',
                    method: 'write',
                    args: [this.env.pos.config.id, {
                        'product_recommendation': product_recommendation,
                        'product_recommendation_number': product_recommendation_number
                    }],
                })
                this.env.pos.config.product_recommendation = product_recommendation
                this.env.pos.config.product_recommendation_number = product_recommendation_number
                owl.Component.env.qweb.forceUpdate();
            }
        }

        async cashInOut() {
            const sessions = await this.rpc({
                model: 'pos.session',
                method: 'search_read',
                args: [[['id', '=', this.env.pos.pos_session.id]]]
            })
            if (sessions.length) {
                const sessionSelected = sessions[0]
                let startedAt = field_utils.parse.datetime(sessionSelected.start_at);
                sessionSelected.start_at = field_utils.format.datetime(startedAt);
                let {confirmed, payload: values} = await this.showPopup('CashSession', {
                    title: this.env._t('Take Cash In/Out of Your Session'),
                    session: sessionSelected
                })
                if (confirmed) {
                    let action = values.action
                    if ((action == 'putMoneyIn' || action == 'takeMoneyOut') && values.value.amount != 0) {
                        await this.rpc({
                            model: 'cash.box.out',
                            method: 'cash_input_from_pos',
                            args: [0, values.value],
                        })
                        if (action == "putMoneyIn") {
                            this.env.pos.alert_message({
                                title: this.env._t('Successfully'),
                                body: this.env._t('Put Money In: ') + this.env.pos.format_currency(values.value.amount)
                            })
                        } else {
                            this.env.pos.alert_message({
                                title: this.env._t('Successfully'),
                                body: this.env._t('Take Money Out: ') + this.env.pos.format_currency(values.value.amount)
                            })
                        }
                        return this.cashInOut()
                    }
                    if (action == 'setClosingBalance' && values.value.length > 0) {
                        await this.rpc({
                            model: 'account.bank.statement.cashbox',
                            method: 'validate_from_ui',
                            args: [0, this.env.pos.pos_session.id, 'end', values.value],
                        })
                        this.env.pos.alert_message({
                            title: this.env._t('Successfully'),
                            body: this.env._t('Set Closing Balance !')
                        })
                        return this.cashInOut()
                    }
                }
            }
        }

        get returnStringButton() {
            const selectedOrder = this.env.pos.get_order();
            if (!selectedOrder) {
                return this.env._t('Return is [Off]')
            }
            if (selectedOrder.is_return) {
                return this.env._t('Return is [On]')
            } else {
                return this.env._t('Return is [Off]')
            }
        }

        get isReturnOrder() {
            const selectedOrder = this.env.pos.get_order();
            if (selectedOrder && selectedOrder.is_return) {
                return true
            } else {
                return false
            }
        }

        async changeToReturnMode() {
            const selectedOrder = this.env.pos.get_order();
            if (selectedOrder.picking_type_id) {
                const pickingType = this.env.pos.stock_picking_type_by_id[selectedOrder.picking_type_id]
                if (!pickingType['return_picking_type_id']) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('Your POS [Operation Type]: [ ') + pickingType.name + this.env._t(' ] not set Return Picking Type. Please set it for Return Packing bring stock on hand come back Your POS Stock Location. Operation Type for return required have Default Source Location difference Default Destination Location. Is correctly if Destination Location is your POS stock Location')
                    })
                }

            }
            if (selectedOrder.is_to_invoice() && !selectedOrder.get_client()) {
                this.showPopup('ConfirmPopup', {
                    title: this.env._t('Warning'),
                    body: this.env._t('Order will process to Invoice, please select one Customer for set to current Order'),
                    disableCancelButton: true,
                })
                const {confirmed, payload: newClient} = await this.showTempScreen(
                    'ClientListScreen',
                    {client: null, body: this.env._t('Required Customer')}
                );
                if (confirmed) {
                    selectedOrder.set_client(newClient);
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Order will processing to Invoice, required set a Customer')
                    })
                }
            }
            if (selectedOrder.is_return) {
                selectedOrder.orderlines.models.forEach((l) => {
                    if (l.quantity < 0) {
                        l.set_quantity(-l.quantity, 'keep price when return')
                    }
                })
                selectedOrder.is_return = false
                selectedOrder.trigger('change', selectedOrder)
                return this.showPopup('ConfirmPopup', {
                    title: this.env._t('Successfully'),
                    body: this.env._t('Order change to Normal Mode'),
                    disableCancelButton: true,
                })
            }
            if (selectedOrder.orderlines.length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your order cart is blank')
                })
            }
            if (this.env.pos.config.validate_return) {
                let validate = await this.env.pos._validate_action(this.env._t('Need Approve of Your Manager'));
                if (!validate) {
                    return false;
                }
            }
            let returnMethod = null;
            if (this.env.pos.config.return_method_id) {
                returnMethod = this.env.pos.payment_methods.find((p) => this.env.pos.config.return_method_id && p.id == this.env.pos.config.return_method_id[0])
            }
            if (selectedOrder.orderlines.models.length <= 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Error'),
                    body: this.env._t('Your shopping cart is empty')
                })
            }
            let {confirmed, payload: text} = await this.showPopup('TextAreaPopup', {
                title: this.env._t('Add some notes why customer return products ?'),
                startingValue: selectedOrder.get_note()
            })
            if (confirmed) {
                selectedOrder.set_note(text);
                selectedOrder.orderlines.models.forEach((l) => {
                    if (l.quantity >= 0) {
                        l.set_quantity(-l.quantity, 'keep price when return')
                    }
                })
                if (!returnMethod) {
                    return this.showScreen('PaymentScreen');
                } else {
                    selectedOrder.is_return = true;
                    selectedOrder.paymentlines.models.forEach(function (p) {
                        selectedOrder.remove_paymentline(p)
                    })
                    selectedOrder.add_paymentline(returnMethod);
                    let order_ids = this.env.pos.push_single_order(selectedOrder, {})
                    return this.showScreen('ReceiptScreen');
                }

            }
        }

    }

    FeatureButtons.template = 'FeatureButtons';

    Registries.Component.add(FeatureButtons);

    return FeatureButtons;
});
