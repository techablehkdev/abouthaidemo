odoo.define('pos_retail.PaymentScreen', function (require) {
    'use strict';

    const PaymentScreen = require('point_of_sale.PaymentScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const core = require('web.core');
    const _t = core._t;
    const Session = require('web.Session');
    const {posbus} = require('point_of_sale.utils');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {useState} = owl.hooks;
    const {Gui} = require('point_of_sale.Gui');
    const qweb = core.qweb;
    const {parse} = require('web.field_utils');
    const {useBarcodeReader} = require('point_of_sale.custom_hooks');

    const RetailPaymentScreen = (PaymentScreen) =>
        class extends PaymentScreen {
            constructor() {
                super(...arguments);
                useListener('reference-payment-line', this.setReferencePayment);
                useListener('cheque-tracking-payment-line', this.setChequeTrackingPaymentLine);
                useListener('click-journal', this.setJournal);
                useListener('click-coin', this.setCoin);
                this._currentOrder = this.env.pos.get_order();
                this._currentOrder.orderlines.on('change', this.render, this);
                this.state = useState({showAllMethods: false});
                useBarcodeReader({
                    voucher: this._scanVoucherCode,
                }, true)
                NumberBuffer.use({
                    nonKeyboardInputEvent: 'input-from-numpad',
                    triggerAtInput: 'update-selected-paymentline',
                    triggerPaymentScreen: 'trigger-receipt-screen',
                });
                useListener('trigger-receipt-screen', this._keyboardHandler);
            }

            mounted() {
                // TODO: automatic set wallet or credit customer have, to payment lines
                super.mounted();
                if (this.props.autoValidateOrder) {
                    return this.validateOrder(false)
                }
                this._currentOrder.trigger('automatic-wallet-payment')
                this._currentOrder.trigger('automatic-credit-payment')
            }

            _useGiftCard() {
                this.showPopup("GiftCardPopup", {})
            }

            async _scanVoucherCode(code) {
                if (code == "" || !code) {
                    return true
                }
                const voucher = await this.env.pos.rpc({
                    model: 'pos.voucher',
                    method: 'get_voucher_by_code',
                    args: [code],
                })
                if (voucher == -1) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('Not found any Voucher or Voucher Expired Date')
                    });
                } else {
                    var order = this.env.pos.get_order();
                    if (order) {
                        return order.client_use_voucher(voucher)
                    }
                }
            }

            async _saveOrderJson(orders, options) {
                if (!orders || !orders.length) {
                    return Promise.resolve([]);
                }

                options = options || {};

                const timeout = typeof options.timeout === 'number' ? options.timeout : 30000 * orders.length;
                let args = [_.map(orders, function (order) {
                    order.to_invoice = options.to_invoice || false;
                    return order;
                })];
                args.push(options.draft || false);
                return this.rpc({
                    model: 'pos.order.json',
                    method: 'create_from_ui',
                    args: args,
                    kwargs: {context: this.env.pos.session.user_context},
                }, {
                    timeout: timeout,
                    shadow: !options.to_invoice
                }).then(function (server_ids) {
                    return server_ids;
                }).catch(function (error) {
                    console.error(error)
                });
            }

            async validateOrder(isForceValidate) {
                const self = this
                if (this._currentOrder) {
                    // TODO: remove all payment lines has amount is zero
                    let paymentLines = this._currentOrder.paymentlines.models
                    paymentLines.forEach(function (p) {
                        if (p.amount == 0) {
                            self._currentOrder.remove_paymentline(p)
                        }
                    })
                    paymentLines.forEach(function (p) {
                        if (p.amount == 0) {
                            self._currentOrder.remove_paymentline(p)
                        }
                    })
                    paymentLines.forEach(function (p) {
                        if (p.amount == 0) {
                            self._currentOrder.remove_paymentline(p)
                        }
                    })
                }
                this._saveOrderJson([this._currentOrder.export_as_JSON()])
                return super.validateOrder(isForceValidate)
            }

            async addTip() {
                if (!this.env.pos.config.tip_percent) {
                    return super.addTip()
                } else {
                    const {confirmed, payload} = await this.showPopup('NumberPopup', {
                        title: this.env._t('Are you want set Tip (%) base on Total Due ?'),
                        body: this.env._t('Maximum Tip (%) you can set is ') + this.env.pos.config.tip_percent_max + ' % .',
                        startingValue: this.env.pos.config.tip_percent_max
                    })
                    if (!confirmed) {
                        return super.addTip()
                    } else {
                        const tipPercent = parse.float(payload)
                        if (tipPercent <= 0 || tipPercent > this.env.pos.config.tip_percent_max) {
                            return this.showPopup('ErrorPopup', {
                                title: this.env._t('Warning'),
                                body: this.env._t('Tip Percent required bigger than 0 and smaller than or equal ') + this.env.pos.config.tip_percent_max + ' %.',
                            })
                        } else {
                            const totalWithTax = this.currentOrder.get_total_with_tax()
                            const tipAmount = totalWithTax / 100 * tipPercent
                            this.currentOrder.set_tip(tipAmount)
                            return this.showPopup('ConfirmPopup', {
                                title: this.env._t('Successfully'),
                                body: this.env._t('Set tip Amount to Order: ') + this.env.pos.format_currency(tipAmount),
                            })
                        }
                    }
                }
            }

            async changeCurrency() {
                const self = this
                const list = this.env.pos.multi_currencies.map(c => ({
                    id: c.id,
                    label: c.name,
                    isSelected: false,
                    item: c
                }))
                let {confirmed, payload: currency} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('Choice Currency for Payment Order'),
                    list: list,
                });
                if (confirmed) {
                    const pricelistOfOrder = this.currentOrder.pricelist
                    pricelistOfOrder.currency_id = [currency['id'], currency['name']]
                    this.currentOrder.currency = currency
                    this.currentOrder.set_pricelist(pricelistOfOrder)
                    let paymentLines = this.currentOrder.paymentlines.models
                    paymentLines.forEach(function (p) {
                        self.currentOrder.remove_paymentline(p)
                    })
                    paymentLines.forEach(function (p) {
                        self.currentOrder.remove_paymentline(p)
                    })
                }
            }

            OnChangeNote(event) {
                const newNote = event.target.value;
                if (this._currentOrder) {
                    this._currentOrder.set_note(newNote)
                }
            }


            get showAllPaymentMethodLabel() {
                if (!this.state.showAllMethods) {
                    return this.env._t('All Methods')
                } else {
                    return this.env._t('Basic Methods')
                }
            }

            showAllPaymentMethods() {
                this.state.showAllMethods = !this.state.showAllMethods;
            }

            get PaymentMethods() {
                let allPaymentMethods = this.payment_methods_from_config
                const selectedOrder = this._currentOrder;
                if (!selectedOrder) {
                    return []
                }
                this.selectedCurrency = selectedOrder.currency
                let methods = allPaymentMethods.filter(p => !p.journal || (p.journal && !p.journal.currency_id) || (p.journal && p.journal.currency_id && this.selectedCurrency && p.journal.currency_id[0] == this.selectedCurrency.id) || (!this.selectedCurrency && p))
                if (this.state.showAllMethods) {
                    return methods
                } else {
                    return methods.filter(p => p.pos_method_type == 'default')
                }
            }

            async _finalizeValidation() { // TODO: some pos setting iface_cashdrawer is true but not set proxy_ip
                if (!this.env.pos.proxy.printer) {
                    this.env.pos.config.iface_cashdrawer = false
                }
                super._finalizeValidation();
            }

            async askAddChargeAmount(method) {
                const dueAmount = this.currentOrder.get_due();
                if (dueAmount <= 0) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Warning'),
                        body: this.env._t('Order Full Fill Payments Amount')
                    })
                }
                let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert, need add Fees Charge'),
                    body: this.env._t('Your selected Payment Method need add Fees Charge ?'),
                    confirmText: this.env._t('Add Now !!!'),
                    cancelText: this.env._t('No, keep current Amount of Order')
                })
                if (confirmed) {
                    const productFee = this.env.pos.db.get_product_by_id(method.fees_product_id[0])
                    if (productFee) {
                        this.currentOrder.orderlines.models.forEach(l => {
                            if (l.product.id == productFee['id']) {
                                this.currentOrder.remove_orderline(l)
                            }
                        })
                        this.currentOrder.orderlines.models.forEach(l => {
                            if (l.product.id == productFee['id']) {
                                this.currentOrder.remove_orderline(l)
                            }
                        })
                        let feesAmount = 0
                        if (method.fees_type == 'fixed') {
                            feesAmount = method.fees_amount
                        } else {
                            feesAmount = dueAmount * method.fees_amount / 100
                        }
                        if (feesAmount < 0) {
                            feesAmount = -feesAmount
                        }
                        if (feesAmount != 0) {
                            this.env.pos.alert_message({
                                title: this.env._t('Successfully'),
                                body: this.env._t('Add Fees Amount: ') + this.env.pos.format_currency(feesAmount)
                            })
                            return await this.currentOrder.add_product(productFee, {
                                quantity: 1,
                                price: feesAmount,
                                merge: false
                            });
                        } else {
                            return this.showPopup('ErrorPopup', {
                                title: this.env._t('Error'),
                                body: this.env._t('Fees Amount it not Possible is 0')
                            })
                        }
                    } else {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Error'),
                            body: method.fees_product_id[1] + this.env._t(' Not Available in POS')
                        })
                    }
                } else {
                    return false
                }
            }

            async askApplyDiscount(method) {
                method['discountStr'] = null
                if (method.discount_type == 'percent') {
                    method['discountStr'] = this.env._t('Applied Discount: ') + this.env.pos.format_currency_no_symbol(method.discount_amount) + ' %.'
                } else {
                    method['discountStr'] = this.env._t('Applied Discount: ') + this.env.pos.format_currency(method.discount_amount)
                }
                const dueAmount = this.currentOrder.get_due();
                if (dueAmount <= 0) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Warning'),
                        body: this.env._t('Order Full Fill Payments Amount')
                    })
                }
                let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Alert, Method Allow add Discount'),
                    body: method['discountStr'],
                    confirmText: this.env._t('Add Now !!!'),
                    cancelText: this.env._t('No')
                })
                if (confirmed) {
                    const productDisc = this.env.pos.db.get_product_by_id(method.discount_product_id[0])
                    if (productDisc) {
                        this.currentOrder.orderlines.models.forEach(l => {
                            if (l.product.id == productDisc['id']) {
                                this.currentOrder.remove_orderline(l)
                            }
                        })
                        this.currentOrder.orderlines.models.forEach(l => {
                            if (l.product.id == productDisc['id']) {
                                this.currentOrder.remove_orderline(l)
                            }
                        })
                        let discountAmount = 0
                        if (method.discount_type == 'fixed') {
                            discountAmount = method.discount_amount
                        } else {
                            discountAmount = dueAmount * method.discount_amount / 100
                        }
                        if (discountAmount > 0) {
                            discountAmount = -discountAmount
                        }
                        if (discountAmount != 0) {
                            this.env.pos.alert_message({
                                title: this.env._t('Successfully'),
                                body: this.env._t('Add Discount Amount: ') + this.env.pos.format_currency(discountAmount)
                            })
                            return await this.currentOrder.add_product(productDisc, {
                                quantity: 1,
                                price: discountAmount,
                                merge: false
                            });
                        } else {
                            return this.showPopup('ErrorPopup', {
                                title: this.env._t('Error'),
                                body: this.env._t('Fees Amount it not possible is 0')
                            })
                        }
                    } else {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Error'),
                            body: method.fees_product_id[1] + this.env._t(' Not Available in POS')
                        })
                    }
                } else {
                    return false
                }
            }


            async addNewPaymentLine({detail: paymentMethod}) {
                if (paymentMethod.discount) {
                    await this.askApplyDiscount(paymentMethod)
                }
                if (paymentMethod.apply_charges && paymentMethod.fees_amount > 0) {
                    await this.askAddChargeAmount(paymentMethod)
                }
                super.addNewPaymentLine({detail: paymentMethod});
                this.env.pos.trigger('refresh.customer.facing.screen');
                const selected_paymentline = this.currentOrder.selected_paymentline;
                if (paymentMethod && paymentMethod['cheque_bank_information'] && selected_paymentline) {
                    this.setChequeTrackingPaymentLine({
                        detail: {
                            cid: selected_paymentline['cid']
                        }
                    })
                }
            }

            _updateSelectedPaymentline() {
                super._updateSelectedPaymentline();
                if ((this.selectedPaymentLine && this.selectedPaymentLine.payment_method.pos_method_type == "rounding") || !this.selectedPaymentLine) {
                    const cashMethod = this.payment_methods_from_config.find(p => p.journal && p.is_cash_count && p.pos_method_type == 'default')
                    if (cashMethod) {
                        this.currentOrder.add_paymentline(cashMethod);
                    }
                }
                this.env.pos.trigger('refresh.customer.facing.screen');
            }

            deletePaymentLine(event) {
                const {cid} = event.detail;
                const line = this.paymentLines.find((line) => line.cid === cid);
                if (line) {
                    super.deletePaymentLine(event);
                    this.env.pos.trigger('refresh.customer.facing.screen');
                    console.log('[deletePaymentLine] deleted payment line')
                }
            }

            selectPaymentLine(event) {
                super.selectPaymentLine(event);
                this.env.pos.trigger('refresh.customer.facing.screen');
            }

            _keyboardHandler(event) {
                const keyName = event.detail.key
                console.log('[ Key enter ] : ' + keyName)
                if (keyName == "ArrowRight" || keyName == "Enter") {
                    this.validateOrder()
                }
                if (keyName == "b" || keyName == "Escape") {
                    $(this.el).find('.back').click()
                }
                if (keyName == "c") {
                    this.selectClient()
                }
                if (keyName == "i") { // i Invoice
                    this.toggleIsToInvoice()
                }
                if (keyName == "l") {
                    $('.close_button').click()
                }
                if (keyName == "r") {
                    let selectedPaymentline = this.currentOrder.selected_paymentline
                    if (selectedPaymentline && selectedPaymentline.payment_method && selectedPaymentline.payment_method.pos_method_type != 'rounding') {
                        this.currentOrder.remove_paymentline(selectedPaymentline)
                        if (this.currentOrder.paymentlines.models.length > 0) {
                            this.currentOrder.select_paymentline(this.currentOrder.paymentlines.models[0]);
                        }
                        NumberBuffer.reset()
                        this.render()
                    }
                }
                if (keyName == "t") {
                    this.addTip()
                }
                if (keyName == "ArrowUp" || keyName == "ArrowDown") {
                    let selectedPaymentline = this.currentOrder.selected_paymentline
                    if (selectedPaymentline) {
                        for (let i = 0; i < this.currentOrder.paymentlines.models.length; i++) {
                            let line = this.currentOrder.paymentlines.models[i]
                            if (line.cid == selectedPaymentline.cid) {
                                let payment_number = null;
                                if (keyName == "ArrowUp") {
                                    if (i == 0) {
                                        payment_number = this.currentOrder.paymentlines.models.length - 1
                                    } else {
                                        payment_number = i - 1
                                    }
                                } else { // down
                                    if (i + 1 >= this.currentOrder.paymentlines.models.length) {
                                        payment_number = 0
                                    } else {
                                        payment_number = i + 1
                                    }
                                }
                                this.currentOrder.select_paymentline(this.currentOrder.paymentlines.models[payment_number]);
                                NumberBuffer.reset()
                                this.render()
                                break;
                            }
                        }
                    } else {
                        if (this.currentOrder.paymentlines.models.length >= 1) {
                            this.currentOrder.select_paymentline(this.currentOrder.paymentlines.models[0]);
                            NumberBuffer.reset()
                            this.render()
                        }
                    }
                }
                const line = this.paymentLines.find((line) => line.payment_method && line.payment_method.shortcut_keyboard === keyName);
                if (line) {
                    this.currentOrder.select_paymentline(line);
                    NumberBuffer.reset();
                    this.render();
                } else {
                    const paymentMethod = this.payment_methods_from_config.find((p) => p.shortcut_keyboard && p.shortcut_keyboard === keyName)
                    if (paymentMethod) {
                        this.currentOrder.add_paymentline(paymentMethod);
                        this.render()
                    }
                }
            }

            setCoin(event) {
                let selectedOrder = this.currentOrder;
                let selectedPaymentline = selectedOrder.selected_paymentline
                if ((!selectedPaymentline) || (selectedPaymentline.payment_method && selectedPaymentline.payment_method.pos_method_type != 'default')) {
                    let cashMethod = this.payment_methods_from_config.find((p) => p.journal && p.pos_method_type == 'default' && p.is_cash_count)
                    if (!cashMethod) {
                        this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: this.env._t(
                                'Cash method not found in your pos !'
                            ),
                        });
                    } else {
                        this.currentOrder.add_paymentline(cashMethod);
                        selectedPaymentline = this.currentOrder.selected_paymentline;
                        selectedPaymentline.set_amount(event.detail.amount);
                    }
                } else {
                    selectedPaymentline.set_amount(selectedPaymentline.amount + event.detail.amount);
                }
                this.currentOrder.trigger('change', this.currentOrder);
            }

            setJournal(event) {
                let selectedOrder = this.currentOrder;
                selectedOrder.payment_journal_id = event.detail.id
                selectedOrder.trigger('change', selectedOrder);
            }

            async setReferencePayment(event) {
                const {cid} = event.detail;
                const line = this.paymentLines.find((line) => line.cid === cid);
                let {confirmed, payload: ref} = await this.showPopup('TextInputPopup', {
                    title: this.env._t('Payment Reference Notes ?'),
                    startingValue: line.ref || ''
                })
                if (confirmed) {
                    line.set_reference(ref);
                    this.render()
                }
            }

            async roundingTotalPaid() {
                let selectedOrder = this.env.pos.get_order();
                let roundingMethod = this.payment_methods_from_config.find((p) => p.journal && p.pos_method_type == 'rounding')
                if (!selectedOrder || !roundingMethod) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Warning'),
                        body: this.env._t('You active Rounding on POS Setting but your POS Payment Method missed add Payment Method [Rounding Amount]'),
                    })
                }
                selectedOrder.paymentlines.models.forEach(function (p) {
                    if (p.payment_method && p.payment_method.journal && p.payment_method.pos_method_type == 'rounding') {
                        selectedOrder.remove_paymentline(p)
                    }
                })
                let due = selectedOrder.get_due();
                if (due == 0) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Warning'),
                        body: this.env._t('Due Amount is 0, please remove all payments register the first'),
                    })
                }
                let amountRound = 0;
                if (this.env.pos.config.rounding_type == 'rounding_integer') {
                    let decimal_amount = due - Math.floor(due);
                    if (decimal_amount <= 0.25) {
                        amountRound = -decimal_amount
                    } else if (decimal_amount > 0.25 && decimal_amount < 0.75) {
                        amountRound = 1 - decimal_amount - 0.5;
                        amountRound = 0.5 - decimal_amount;
                    } else if (decimal_amount >= 0.75) {
                        amountRound = 1 - decimal_amount
                    }
                } else if (this.env.pos.config.rounding_type == 'rounding_up_down') {
                    let decimal_amount = due - Math.floor(due);
                    if (decimal_amount < 0.5) {
                        amountRound = -decimal_amount
                    } else {
                        amountRound = 1 - decimal_amount;
                    }
                } else {
                    let after_round = Math.round(due * Math.pow(10, roundingMethod.journal.decimal_rounding)) / Math.pow(10, roundingMethod.journal.decimal_rounding);
                    amountRound = after_round - due;
                }
                if (amountRound == 0) {
                    this.showPopup('ConfirmPopup', {
                        title: this.env._t("Warning"),
                        body: this.env._t("Total Paid of Order have not any rounding Amount"),
                    })
                } else {
                    selectedOrder.add_paymentline(roundingMethod);
                    let roundedPaymentLine = selectedOrder.selected_paymentline;
                    roundedPaymentLine.set_amount(-amountRound);
                }
            }


            async setChequeTrackingPaymentLine(event) {
                const {cid} = event.detail;
                const line = this.paymentLines.find((line) => line.cid === cid);
                let {confirmed, payload: datas} = await this.showPopup('PopUpSetChequePaymentLine', {
                    title: this.env._t('Set Cheque Bank Information'),
                    cheque_owner: line.cheque_owner,
                    cheque_bank_id: line.cheque_bank_id,
                    cheque_bank_account: line.cheque_bank_account,
                    cheque_check_number: line.cheque_check_number,
                    cheque_card_name: line.cheque_card_name,
                    cheque_card_number: line.cheque_card_number,
                    cheque_card_type: line.cheque_card_type,
                })
                if (confirmed) {
                    line.cheque_card_name = datas['cheque_card_name']
                    line.cheque_card_number = datas['cheque_card_number']
                    line.cheque_card_type = datas['cheque_card_type']
                    line.cheque_bank_account = datas['cheque_bank_account']
                    line.cheque_bank_id = parseInt(datas['cheque_bank_id'])
                    line.cheque_check_number = datas['cheque_check_number']
                    line.cheque_owner = datas['cheque_owner']
                    line.trigger('change', line)
                }
            }

            async _isOrderValid() {
                let extendValidate = true
                const self = this;
                if (this.currentOrder) {
                    let totalWithTax = this.currentOrder.get_total_with_tax();
                    if (!this.env.pos.config.allow_payment_zero && totalWithTax == 0) {
                        this.env.pos.alert_message({
                            title: this.env._t('Error'),
                            body: this.env._t(
                                'Your POS not allow payment order with Amount Total is 0, required difference 0'
                            ),
                        });
                        extendValidate = false
                    }
                }
                if (this.env.pos.config.validate_payment && !this.currentOrder.valid_payment) {
                    let validate = await this.env.pos._validate_action(this.env._t('Go to Payment Order'));
                    if (!validate) {
                        return false;
                    } else {
                        this.currentOrder.valid_payment = true
                    }
                }
                const linePriceSmallerThanZero = this.currentOrder.orderlines.models.find(l => l.get_price_with_tax() <= 0 && !l.promotion)
                if (this.env.pos.config.validate_return && linePriceSmallerThanZero) {
                    let validate = await this.env.pos._validate_action(this.env._t('Have one Line have Price smaller than or equal 0. Please check'));
                    if (!validate) {
                        extendValidate = false
                    }
                }

                const lineIsAmountSmallerThanZeroAndProductTypeIsConsu = this.currentOrder.orderlines.models.find(l => l.product.type == 'consu' && l.get_price_with_tax() <= 0 && !l.promotion)
                if (lineIsAmountSmallerThanZeroAndProductTypeIsConsu && this.currentOrder.picking_type_id) {
                    const pickingType = this.env.pos.stock_picking_type_by_id[selectedOrder.picking_type_id]
                    if (!pickingType['return_picking_type_id']) {
                        extendValidate = false
                        this.env.pos.alert_message({
                            title: this.env._t('Warning'),
                            body: this.env._t('Your POS [Operation Type]: [ ') + pickingType.name + this.env._t(' ] not set Return Picking Type. Please set it for Return Packing bring stock on hand come back Your POS Stock Location. Operation Type for return required have Default Source Location difference Default Destination Location. Is correctly if Destination Location is your POS stock Location')
                        })
                    }
                }
                const isValid = await super._isOrderValid()
                if (this.env.pos.config.warning_odoo_offline && this.env.pos.networkCrashed) {
                    this.env.pos.alert_message({
                        title: this.env._t('Warning. Your network or Odoo Offline mode'),
                        body: this.env._t('Orders can not submit to backend'),
                    })
                }
                if (isValid && extendValidate) {
                    Gui.playSound('bell');
                } else {
                    Gui.playSound('error');
                }
                return isValid && extendValidate
            }

            async inputVoucherCode() {
                const due = this.currentOrder.get_due();
                if (due <= 0) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('Order full fill Amount, can not use Voucher')
                    })
                }
                const {confirmed, payload} = await this.showPopup('TextInputPopup', {
                    title: _t('You can Scan to Voucher Barcode or Input Code direct here.'),
                    startingValue: '',
                    confirmText: this.env._t('Validate Code'),
                    cancelText: this.env._t('Close'),
                });
                if (confirmed) {
                    let code = payload
                    if (code) {
                        let voucher = await this.env.pos.rpc({
                            model: 'pos.voucher',
                            method: 'get_voucher_by_code',
                            args: [code],
                        })
                        if (voucher == -1) {
                            return this.showPopup('ErrorPopup', {
                                title: this.env._t('Error'),
                                body: this.env._t('Voucher not found or Voucher have Expired Date')
                            });
                        } else {
                            var order = this.env.pos.get_order();
                            if (order) {
                                return order.client_use_voucher(voucher)
                            }
                        }
                    } else {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Warning'),
                            body: this.env._t('Voucher Code not found'),
                        })
                    }
                }
            }

            async covertToVoucher() {
                const selectedOrder = this.currentOrder
                let value = selectedOrder.get_total_with_tax()
                if (value < 0) {
                    value = -value
                }
                if (value == 0) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('It not possible covert Order with amount 0 to Voucher')
                    });
                }
                let {confirmed, payload: confirming} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Covert Total Amount to Voucher'),
                    body: this.env._t('Are you want covert ' + this.env.pos.format_currency(value) + ' of Order to Voucher ?')
                })
                if (confirmed) {
                    let number = await this.env.pos._getVoucherNumber()
                    const {confirmed, payload} = await this.showPopup('PopUpPrintVoucher', {
                        title: this.env._t('Covert Order to Voucher, current Order will drop and covert to Voucher'),
                        number: number,
                        value: value,
                        period_days: this.env.pos.config.expired_days_voucher,
                    });
                    if (confirmed) {
                        let values = payload.values;
                        let error = payload.error;
                        if (!error) {
                            let voucher = await this.rpc({
                                model: 'pos.voucher',
                                method: 'create_from_ui',
                                args: [[], values],
                                context: {}
                            })
                            let url_location = window.location.origin + '/report/barcode/EAN13/';
                            voucher['url_barcode'] = url_location + voucher['code'];
                            let report_html = qweb.render('VoucherCard', this.env.pos._get_voucher_env(voucher));
                            selectedOrder.destroy({'reason': 'abandon'});
                            this.env.pos.do_action('pos_retail.report_pos_voucher_small_size', {
                                additional_context: {
                                    active_ids: [voucher.id],
                                }
                            });
                            return this.showScreen('ReportScreen', {
                                report_html: report_html
                            });
                        } else {
                            this.env.pos.alert_message({
                                title: this.env._t('Error'),
                                body: error,
                            })
                        }
                    }
                }
            }

            get getLoyaltyPoints() {
                let client = this.currentOrder.get_client()
                if (!client || !this.env.pos.rewards || (client && client['pos_loyalty_point'] <= 0)) {
                    return this.env._t('Loyalty not Available')
                } else {
                    return this.env._t('Use Points: ') + this.env.pos.format_currency_no_symbol(client['pos_loyalty_point'])
                }
            }

            async selectLoyaltyReward() {
                let client = this.currentOrder.get_client();
                if (!client) {
                    const {confirmed, payload: newClient} = await this.env.pos.chrome.showTempScreen(
                        'ClientListScreen',
                        {
                            client: null,
                            body: this.env._t('Required Customer')
                        }
                    );
                    if (confirmed) {
                        this.currentOrder.set_client(newClient);
                        client = this.currentOrder.get_client();
                    } else {
                        posbus.trigger('set-screen', 'Payment')
                    }
                    posbus.trigger('set-screen', 'Payment')

                }
                if (!client || !this.env.pos.rewards || client['pos_loyalty_point'] <= 0) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Warning'),
                        body: this.env._t('Customer not set or have not any Reward available in your POS')
                    })
                }
                let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup', {
                    title: client.name,
                    body: this.env._t('Have total points: ') + this.env.pos.format_currency_no_symbol(client['pos_loyalty_point']),
                    confirmText: this.env._t('Use Points now'),
                    cancelText: this.env._t('Close')
                })
                if (confirmed) {
                    const list = this.env.pos.rewards.map(reward => ({
                        id: reward.id,
                        label: reward.name,
                        isSelected: false,
                        item: reward
                    }))
                    let {confirmed, payload: reward} = await this.showPopup('SelectionPopup', {
                        title: this.env._t('Please select one Reward need apply to customer'),
                        list: list,
                    });
                    if (confirmed) {
                        this.currentOrder.setRewardProgram(reward)
                    }
                }
            }

            async saveToWallet() {
                const due = this.currentOrder.get_due();
                if (due >= 0) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('Order have not change amount for save to Wallet')
                    })
                }
                let self = this;
                let walletMethod = this.payment_methods_from_config.find((p) => p.journal && p.pos_method_type == 'wallet')
                let changeAmount = this.currentOrder.get_change();
                if (!walletMethod) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('Your pos have not add Wallet Payment Method, please go to Journal create one Wallet journal with method type is wallet, and create one Payment Method type wallet link to this Journal Wallet')
                    })
                }
                if (changeAmount <= 0) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('Change amount not found, it not possible add to Wallet. Required change amount bigger than 0')
                    })
                }
                if (!this.currentOrder.get_client()) {
                    const {confirmed, payload: newClient} = await this.showTempScreen(
                        'ClientListScreen',
                        {
                            client: null,
                            body: this.env._t('Required Customer')
                        }
                    );
                    if (confirmed) {
                        this.currentOrder.set_client(newClient);
                    } else {
                        posbus.trigger('set-screen', 'Payment')
                    }
                    posbus.trigger('set-screen', 'Payment')
                }
                let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                    title: this.env._t('Which wallet amount save to Wallet of Customer ?'),
                    startingValue: changeAmount
                })
                if (confirmed) {
                    if (number > changeAmount) {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Error'),
                            body: this.env._t('Amount save to Wallet not possible bigger than amount change')
                        })
                    }
                    let paymentLines = this.currentOrder.paymentlines.models
                    paymentLines.forEach(function (p) {
                        if (p.payment_method && p.payment_method.journal && p.payment_method.pos_method_type == 'wallet') {
                            self.currentOrder.remove_paymentline(p)
                        }
                    })
                    this.currentOrder.add_paymentline(walletMethod);
                    let paymentline = this.currentOrder.selected_paymentline;
                    paymentline.set_amount(-(parseFloat(number)));
                    this.currentOrder.trigger('change', this.currentOrder);
                }

            }

            get customerHasWallet() {
                if (this.currentOrder.get_client() && this.currentOrder.get_client().wallet > 0) {
                    return true
                } else {
                    return false
                }
            }

            async useWalletPaid() {
                let self = this;
                let amountDue = this.currentOrder.get_total_with_tax() + this.currentOrder.get_rounding_applied()
                let startingValue = 0;
                let clientWallet = this.currentOrder.get_client().wallet
                let walletMethod = this.payment_methods_from_config.find((p) => p.journal && p.pos_method_type == 'wallet')
                if (!walletMethod) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('Your pos have not add Wallet Payment Method, please go to Journal create one Wallet journal with method type is wallet, and create one Payment Method type wallet link to this Journal Wallet')
                    })
                }
                if (!this.currentOrder.get_client()) {
                    const {confirmed, payload: newClient} = await this.showTempScreen(
                        'ClientListScreen',
                        {
                            client: null,
                            body: this.env._t('Required Customer')
                        }
                    );
                    if (confirmed) {
                        this.currentOrder.set_client(newClient);
                    } else {
                        posbus.trigger('set-screen', 'Payment')
                    }
                    posbus.trigger('set-screen', 'Payment')
                }
                if (clientWallet >= amountDue) {
                    startingValue = amountDue
                } else {
                    startingValue = clientWallet
                }
                let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                    title: this.env._t('Maximum Wallet Customer can add :') + this.env.pos.format_currency(startingValue),
                    startingValue: startingValue
                })
                if (confirmed) {
                    if (number > clientWallet) {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Error'),
                            body: this.env._t('Wallet amount just input required smaller than or equal wallet points customer have: ') + this.currentOrder.get_client().wallet
                        })
                    }
                    if (number > amountDue) {
                        number = amountDue
                    }
                    let paymentLines = this.currentOrder.paymentlines.models
                    paymentLines.forEach(function (p) {
                        if (p.payment_method && p.payment_method.journal && p.payment_method.pos_method_type == 'wallet') {
                            self.currentOrder.remove_paymentline(p)
                        }
                    })
                    this.currentOrder.add_paymentline(walletMethod);
                    let paymentline = this.currentOrder.selected_paymentline;
                    paymentline.set_amount((parseFloat(number)));
                    this.currentOrder.trigger('change', this.currentOrder);
                }

            }

            get customerHasCredit() {
                if (this.currentOrder.get_client() && this.currentOrder.get_client().balance > 0) {
                    return true
                } else {
                    return false
                }
            }

            async useCreditPaid() {
                let self = this;
                let amountDue = this.currentOrder.get_total_with_tax() + this.currentOrder.get_rounding_applied()
                let startingValue = 0;
                let clientCredit = this.currentOrder.get_client().balance
                let creditMethod = this.payment_methods_from_config.find((p) => p.journal && p.pos_method_type == 'credit')
                if (!creditMethod) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('Your pos have not add Wallet Payment Method, please go to Journal create one Wallet journal with method type is wallet, and create one Payment Method type wallet link to this Journal Wallet')
                    })
                }
                if (amountDue <= 0) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('Due amount required bigger than 0')
                    })
                }
                if (!this.currentOrder.get_client()) {
                    const {confirmed, payload: newClient} = await this.showTempScreen(
                        'ClientListScreen',
                        {
                            client: null,
                            body: this.env._t('Required Customer')
                        }
                    );
                    if (confirmed) {
                        this.currentOrder.set_client(newClient);
                    } else {
                        posbus.trigger('set-screen', 'Payment')
                    }
                    posbus.trigger('set-screen', 'Payment')
                }
                if (clientCredit >= amountDue) {
                    startingValue = amountDue
                } else {
                    startingValue = clientCredit
                }
                let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                    title: this.env._t('Maximum Credit Customer can add :') + this.env.pos.format_currency(startingValue),
                    startingValue: startingValue
                })
                if (confirmed) {
                    if (number > clientCredit) {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Error'),
                            body: this.env._t('Credit amount just input required smaller than or equal credit points customer have: ') + clientCredit
                        })
                    }
                    if (number > amountDue) {
                        number = amountDue
                    }
                    let paymentLines = this.currentOrder.paymentlines.models
                    paymentLines.forEach(function (p) {
                        if (p.payment_method && p.payment_method.journal && p.payment_method.pos_method_type == 'credit') {
                            self.currentOrder.remove_paymentline(p)
                        }
                    })
                    this.currentOrder.add_paymentline(creditMethod);
                    let paymentline = this.currentOrder.selected_paymentline;
                    paymentline.set_amount((parseFloat(number)));
                    this.currentOrder.trigger('change', this.currentOrder);
                }

            }

            async selectClient() {
                await super.selectClient()
                posbus.trigger('set-screen', 'Payment')
            }


        }
    Registries.Component.extend(PaymentScreen, RetailPaymentScreen);

    return RetailPaymentScreen;
});
