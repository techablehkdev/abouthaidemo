odoo.define('pos_retail.ReceiptScreen', function (require) {
    'use strict';

    const ReceiptScreen = require('point_of_sale.ReceiptScreen')
    const Registries = require('point_of_sale.Registries')
    const core = require('web.core')
    const qweb = core.qweb
    const {Printer} = require('point_of_sale.Printer')
    const framework = require('web.framework')
    const {useBarcodeReader} = require('point_of_sale.custom_hooks')
    const NumberBuffer = require('point_of_sale.NumberBuffer')
    const {useListener} = require('web.custom_hooks')
    const QWeb = core.qweb
    const {posbus} = require('point_of_sale.utils')

    const RetailReceiptScreen = (ReceiptScreen) =>
        class extends ReceiptScreen {
            constructor() {
                super(...arguments);
                NumberBuffer.use({
                    triggerReceiptScreen: 'trigger-receipt-screen',
                });
                useListener('trigger-receipt-screen', this._keyboardHandler);
                useBarcodeReader({
                    product: this._scanBarcode,
                    weight: this._scanBarcode,
                    price: this._scanBarcode,
                    client: this._scanBarcode,
                    discount: this._scanBarcode,
                    error: this._scanBarcode,
                })
            }

            async _scanBarcode(code) {
                this.env.pos.barcodeQueue = code
                await this.orderDone()
            }

            mounted() {
                super.mounted()
                this.env.pos.on('reload:receipt', this.render, this);
                setTimeout(async () => await this.automaticNextScreen(), 0);
                setTimeout(async () => await this._applyStyleCssToReceipt(), 0);
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

            async _saveReceipt() {
                try {
                    const printer = new Printer();
                    const receiptString = this.orderReceipt.comp.el.outerHTML;
                    const ticketImage = await printer.htmlToImg(receiptString);
                    const order = this.currentOrder;
                    const orderName = order.get_name();
                    const order_server_id = this.env.pos.validated_orders_name_server_id_map[orderName];
                    await this.rpc({
                        model: 'pos.order',
                        method: 'saveReceipt',
                        args: [[], order_server_id, ticketImage],
                    });
                } catch (ex) {
                    return false
                }
            }

            get orderAmountPlusTip() {
                let headerTextScreen = super.orderAmountPlusTip
                const order = this.currentOrder;
                let baseChange = this.env.pos.format_currency(order.get_change())
                return headerTextScreen + ` and Change: ${baseChange}`;
            }

            async orderDone() {
                const selectedOrder = this.env.pos.get_order()
                if (this.env.pos.config.whatsapp_api && this.env.pos.config.whatsapp_token && this.env.pos.config.whatsapp_send_type == 'automatic' && selectedOrder && !selectedOrder.sendReceiptViaWhatApp) {
                    await this.sendReceiptViaWhatsApp()
                }
                if (selectedOrder) {
                    console.log('[orderDone]: Begin done order ' + selectedOrder.uid)
                }
                if (selectedOrder && selectedOrder.skipOrder) {
                    console.warn('[orderDone] order is active skipOrder, not call finalize()')
                    return false
                }
                if (this.env.pos.config.save_receipt) {
                    await this._saveReceipt()
                }
                return await super.orderDone()
            }

            async sendReceiptViaWhatsApp() {
                const printer = new Printer();
                const order = this.env.pos.get_order()
                const client = order.get_client();
                let mobile_no = ''
                if (!client || (!client['mobile'] && !client['phone'])) {
                    let {confirmed, payload: mobile_no} = await this.showPopup('NumberPopup', {
                        title: this.env._t("Are you want send Receipt to customer via WhatApps Number"),
                        body: this.env._t('Please input your Customer Phone/Mobile bellow.'),
                        startingValue: 0,
                        cancelText: this.env._t('No, Close'),
                        confirmText: this.env._t('Send')
                    })
                } else {
                    mobile_no = client.mobile || client.phone
                }
                if (mobile_no) {
                    const receiptString = this.orderReceipt.comp.el.outerHTML;
                    const ticketImage = await printer.htmlToImg(receiptString);
                    framework.blockUI()
                    let responseOfWhatsApp = await this.rpc({
                        model: 'pos.config',
                        method: 'send_receipt_via_whatsapp',
                        args: [[], this.env.pos.config.id, ticketImage, mobile_no, this.env.pos.config.whatsapp_message_receipt + ' ' + order['name']],
                    }, {
                        shadow: true,
                        timeout: 60000
                    }).then(function (responseOfWhatsApp) {
                        return responseOfWhatsApp

                    }, function (err) {
                        framework.unblockUI()
                    });
                    framework.unblockUI()
                    if (responseOfWhatsApp == false) {
                        return this.env.pos.alert_message({
                            title: this.env._t('Warning'),
                            body: this.env._t("Mobile Number wrong format, Please checking Mobile WhatsApp number of Client"),
                        })
                    }
                    if (responseOfWhatsApp && responseOfWhatsApp['id']) {
                        order.sendReceiptViaWhatApp = true;
                        return this.env.pos.alert_message({
                            title: this.env._t('Successfully send to: ') + mobile_no,
                            body: this.env._t("Receipt send successfully to your Client's Phone WhatsApp: ") + mobile_no,
                        })
                    } else {
                        return this.env.pos.alert_message({
                            title: this.env._t('Fail send Receipt to: ') + mobile_no,
                            body: this.env._t("Send Receipt is fail, please check WhatsApp API and Token of your pos config or Your Server turn off Internet"),
                        })
                    }
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t("Mobile number for send receipt via whatapps not found"),
                    })
                }
            }


            async automaticNextScreen() {
                if (this.env.pos.config.validate_order_without_receipt && this.currentOrder) {
                    // if (this.env.pos.config.iface_print_auto) {
                    //     await this.printReceipt()
                    //     await this.handleAutoPrint()
                    // }
                    // kimanh: disable it, if validate_order_without_receipt is active only set orderDone()
                    if (this.currentOrder.is_to_invoice() && this.currentOrder.get_client()) {
                        await this.downloadInvoice()
                    }
                    this.orderDone();
                }
            }

            async handleAutoPrint() {
                super.handleAutoPrint()
            }

            willUnmount() {
                super.willUnmount()
                this.env.pos.off('reload:receipt', null, this);
            }

            _keyboardHandler(event) {
                const keyName = event.detail.key
                console.log('[ Key enter ] : ' + keyName)
                if (keyName == "ArrowRight" || keyName == "Enter") {
                    $(this.el).find('.next').click()
                }
                if (keyName == "d") {
                    $(this.el).find('.download').click()
                }
                if (keyName == "p") {
                    $(this.el).find('.print').click()
                }
                if (keyName == "l") {
                    $('.close_button').click()
                }
            }

            async downloadDeliveryReport() {
                this.env.pos.chrome.showNotification(this.env._t('Alert'), this.env._t('Waiting Download Delivery Report'))
                let order_ids = await this.rpc({
                    model: 'pos.order',
                    method: 'search_read',
                    domain: [['pos_reference', '=', this.currentOrder.name]],
                    fields: ['id', 'picking_ids', 'partner_id']
                })
                if (order_ids.length == 1) {
                    let backendOrder = order_ids[0]
                    if (backendOrder.picking_ids.length > 0) {
                        await this.env.pos.do_action('stock.action_report_picking', {
                            additional_context: {
                                active_ids: backendOrder.picking_ids,
                            }
                        })
                    }
                }
            }

            async downloaOrderReport() {
                this.env.pos.chrome.showNotification(this.env._t('Alert'), this.env._t('Waiting Download Order Report'))
                let order_ids = await this.rpc({
                    model: 'pos.order',
                    method: 'search_read',
                    domain: [['pos_reference', '=', this.currentOrder.name]],
                    fields: ['id', 'picking_ids', 'partner_id']
                })
                if (order_ids.length == 1) {
                    let backendOrder = order_ids[0]
                    await this.env.pos.do_action('pos_retail.report_pos_order', {
                        additional_context: {
                            active_ids: [backendOrder.id],
                        }
                    })
                }
            }

            async downloadInvoice() {
                let order_ids = await this.rpc({
                    model: 'pos.order',
                    method: 'search_read',
                    domain: [['pos_reference', '=', this.currentOrder.name]],
                    fields: ['id', 'account_move', 'partner_id']
                })
                if (order_ids.length == 1) {
                    let backendOrder = order_ids[0]
                    if (!backendOrder.account_move) {
                        let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                            title: this.env._t('Warning'),
                            body: this.env._t('Invoice not set for this Order, Are you want add Invoice ?')
                        })
                        if (confirmed) {
                            if (!backendOrder.partner_id) {
                                this.env.pos.alert_message({
                                    title: this.env._t('Alert'),
                                    body: this.env._t('Order missed Customer, please select  customer for create invoice')
                                })
                                this.env.pos.alert_message({
                                    title: this.env._t('Warning'),
                                    body: this.env._t('Required set Customer to Order to Processing to Invoice')
                                })
                                let {confirmed, payload: newClient} = await this.showTempScreen(
                                    'ClientListScreen',
                                    {client: null, body: this.env._t('Required Customer')}
                                );
                                if (confirmed) {
                                    let {confirmed, payload: confirm} = await this.showPopup('ConfirmPopup',
                                        {
                                            title: this.env._t('Alert'),
                                            body: newClient['name'] + this.env._t(' will set to current Order, are you sure ?')
                                        }
                                    );
                                    if (confirmed) {
                                        this.env.pos.alert_message({
                                            title: this.env._t('Successfully'),
                                            body: this.env._t('Watiing few seconds for Download the Invoice')
                                        })
                                        await this.rpc({
                                            model: 'pos.order',
                                            method: 'write',
                                            args: [[backendOrder.id], {
                                                'partner_id': newClient.id
                                            }],
                                            context: {}
                                        })
                                        await this.rpc({
                                            model: 'pos.order',
                                            method: 'action_pos_order_invoice',
                                            args: [[backendOrder.id]],
                                        })
                                        await this.env.pos.do_action('point_of_sale.pos_invoice_report', {
                                            additional_context: {
                                                active_ids: [backendOrder.id],
                                            }
                                        })
                                    }

                                }
                            } else {
                                if (!backendOrder.account_move) {
                                    await this.rpc({
                                        model: 'pos.order',
                                        method: 'action_pos_order_invoice',
                                        args: [[backendOrder.id]],
                                    })
                                } else {
                                    await this.env.pos.do_action('point_of_sale.pos_invoice_report', {
                                        additional_context: {
                                            active_ids: [backendOrder.id],
                                        }
                                    })
                                }
                            }
                        }
                    } else {
                        await this.env.pos.do_action('point_of_sale.pos_invoice_report', {
                            additional_context: {
                                active_ids: [backendOrder.id],
                            }
                        })
                    }
                } else {
                    this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('Order has Duplicate. We can not print the Invoice')
                    })
                }
            }
        }
    Registries.Component.extend(ReceiptScreen, RetailReceiptScreen);

    return RetailReceiptScreen;
});
