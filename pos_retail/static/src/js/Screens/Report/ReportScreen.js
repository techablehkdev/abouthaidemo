odoo.define('pos_retail.ReportScreen', function (require) {
    'use strict';

    const {Printer} = require('point_of_sale.Printer');
    const {is_email} = require('web.utils');
    const {useRef, useContext} = owl.hooks;
    const {useErrorHandlers, onChangeOrder} = require('point_of_sale.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const AbstractReceiptScreen = require('point_of_sale.AbstractReceiptScreen');
    const session = require('web.session');
    const {useState} = owl.hooks;
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {useListener} = require('web.custom_hooks')

    const ReportScreen = (AbstractReceiptScreen) => {
        class ReportScreen extends AbstractReceiptScreen {
            constructor() {
                super(...arguments);
                this.report_html = arguments[1].report_html
                useErrorHandlers();
                this.orderReceipt = useRef('order-receipt');
                const order = this.currentOrder;
                if (order) {
                    const client = order.get_client();
                    this.orderUiState = useContext(order.uiState.ReceiptScreen);
                    this.orderUiState.inputEmail = this.orderUiState.inputEmail || (client && client.email) || '';
                    this.is_email = is_email;
                }
                NumberBuffer.use({
                    triggerReportScreen: 'trigger-report-screen',
                });
                useListener('trigger-report-screen', this._keyboardHandler);
            }

            mounted() {
                $(this.el).find('.pos-receipt-container').append(this.report_html)
                setTimeout(async () => await this.handleAutoPrint(), 0);
                setTimeout(async () => await this._applyStyleCssToReceipt(), 0);
            }

            async _keyboardHandler(event) {
                const keyName = event.detail.key
                console.log('[ Key enter ] : ' + keyName)
                if (keyName == "Escape" || keyName == "b") {
                    this.back()
                }
                if (keyName == "p") {
                    this.printReceipt()
                }
                if (keyName == "s") {
                    this._sendReceiptToCustomer()
                }

            }

            async sendReceiptViaWhatsApp() {
                let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                    title: this.env._t("What a WhatsApp Number need to send ?"),
                    startingValue: 0
                })
                if (confirmed) {
                    let mobile_no = number
                    let {confirmed, payload: messageNeedSend} = await this.showPopup('TextAreaPopup', {
                        title: this.env._t('What message need to send ?'),
                        startingValue: ''
                    })
                    if (confirmed) {
                        let message = messageNeedSend
                        const printer = new Printer(null, this.env.pos);
                        const ticketImage = await printer.htmlToImg(this.props.report_html);
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
            }

            async onSendEmail() {
                if (!this.orderUiState) {
                    return false
                }
                if (!is_email(this.orderUiState.inputEmail)) {
                    this.orderUiState.emailSuccessful = false;
                    this.orderUiState.emailNotice = 'Invalid email.';
                    return;
                }
                try {
                    await this._sendReceiptToCustomer();
                    this.orderUiState.emailSuccessful = true;
                    this.orderUiState.emailNotice = 'Email sent.'
                } catch (error) {
                    this.orderUiState.emailSuccessful = false;
                    this.orderUiState.emailNotice = 'Sending email failed. Please try again.'
                }
            }

            get currentOrder() {
                return this.env.pos.get_order();
            }

            back() {
                if (this.props.closeScreen) {
                    window.location = '/web#action=pos_retail.point_of_sale_portal'
                    return true
                }
                this.trigger('close-temp-screen');
                if (this.env.pos.config.sync_multi_session && this.env.pos.config.screen_type == 'kitchen') {
                    return this.showScreen('KitchenScreen', {
                        'selectedOrder': this.props.orderRequest
                    })
                } else {
                    return this.showScreen('ProductScreen')
                }
            }

            async _applyStyleCssToReceipt() {
                if (this.env.pos.config.receipt_fix && this.env.pos.config.receipt_fix_width > 0) {
                    $('head').append('<style type="text/css" media="print">.pos .pos-receipt {width: ' + this.env.pos.config.receipt_fix_width + 'mm !important;}</style>');
                    $('head').append('<style type="text/css">.pos .pos-receipt {width: ' + this.env.pos.config.receipt_fix_width + 'mm !important;}</style>');
                }
                if (this.env.pos.config.receipt_fix && this.env.pos.config.receipt_fix_margin > 0) {
                    $('head').append('<style type="text/css" media="print">.pos .pos-receipt {margin: ' + this.env.pos.config.receipt_fix_margin + 'mm !important;}</style>');
                    $('head').append('<style type="text/css">.pos .pos-receipt {margin: ' + this.env.pos.config.receipt_fix_margin + 'mm !important;}</style>');
                }
                if (this.env.pos.config.receipt_fix && this.env.pos.config.receipt_fix_margin_left > 0) {
                    $('head').append('<style type="text/css" media="print">.pos .pos-receipt {margin-left: ' + this.env.pos.config.receipt_fix_margin_left + 'mm !important;}</style>');
                    $('head').append('<style type="text/css">.pos .pos-receipt {margin-left: ' + this.env.pos.config.receipt_fix_margin_left + 'mm !important;}</style>');
                }
                if (this.env.pos.config.receipt_fix && this.env.pos.config.receipt_fix_margin_right > 0) {
                    $('head').append('<style type="text/css" media="print">.pos .pos-receipt {margin-right: ' + this.env.pos.config.receipt_fix_margin_right + 'mm !important;}</style>');
                    $('head').append('<style type="text/css">.pos .pos-receipt {margin-right: ' + this.env.pos.config.receipt_fix_margin_right + 'mm !important;}</style>');
                }
                if (this.env.pos.config.receipt_fix && this.env.pos.config.receipt_fix_font_size > 0) {
                    $('head').append('<style type="text/css" media="print">.pos .pos-receipt {font-size: ' + this.env.pos.config.receipt_fix_font_size + 'px !important;}</style>');
                    $('head').append('<style type="text/css">.pos .pos-receipt {font-size: ' + this.env.pos.config.receipt_fix_font_size + 'px !important;}</style>');
                }
            }

            async printReceipt() {
                if (this.env.pos.proxy.printer && this.props.report_html) {
                    this.handleAutoPrint()
                } else {
                    this._printWeb()
                }
            }

            async handleAutoPrint() {
                if (this.env.pos.proxy.printer && this.props.report_html) {
                    this.env.pos.proxy.printer.print_receipt(this.props.report_html);
                }
            }

            async _sendReceiptToCustomer() {
                const printer = new Printer();
                const receiptString = this.orderReceipt.comp.el.outerHTML;
                const ticketImage = await printer.htmlToImg(receiptString);
                const order = this.currentOrder;
                const client = order.get_client();
                const orderName = order.get_name();
                const orderClient = {
                    email: this.orderUiState.inputEmail,
                    name: client ? client.name : this.orderUiState.inputEmail
                };
                const order_server_id = this.env.pos.validated_orders_name_server_id_map[orderName];
                await this.rpc({
                    model: 'pos.order',
                    method: 'action_receipt_to_customer',
                    args: [[order_server_id], orderName, orderClient, ticketImage],
                });
            }
        }

        ReportScreen.template = 'ReportScreen';
        return ReportScreen;
    };

    Registries.Component.addByExtending(ReportScreen, AbstractReceiptScreen);

    return ReportScreen;
});
