odoo.define('pos_retail.ButtonPrintQROrderReceipt', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const core = require('web.core');
    const qweb = core.qweb;

    class ButtonPrintQROrderReceipt extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick() {
            let order = this.env.pos.get_order()
            if (order.orderlines.models.length == 0) {
                return this.showPopup('ConfirmPopup', {
                    title: this.env._t('Warning'),
                    body: this.env._t('Order blank cart items'),
                    disableCancelButton: true,
                })
            }
            let items = ""
            for (let i = 0; i < order.orderlines.models.length; i++) {
                let line = order.orderlines.models[i]
                items += line.product.id + ":" + line.quantity + ":" + (line.discount || "N/A") + ":" + line.price + ":" + (line.notes || "N/A") + ";"
            }
            order['qrCodeLink'] = '/report/barcode/QR/' + items
            const QrCode = qweb.render('QrOrderReceipt', {
                order: order
            })
            this.showScreen('ReportScreen', {
                report_html: QrCode
            })
            this.showPopup('ConfirmPopup', {
                title: this.env._t('QR-Code Order Receipt'),
                body: this.env._t('QR Receipt included all items in order cart (quantity, discount, product). Give receipt to Cashier, them can scan it and automatic add items to Cart'),
                disableCancelButton: true,
            })
        }
    }

    ButtonPrintQROrderReceipt.template = 'ButtonPrintQROrderReceipt';

    ProductScreen.addControlButton({
        component: ButtonPrintQROrderReceipt,
        condition: function () {
            return true;
        },
        position: ['before', 'ButtonScanQrCode'],
    });

    Registries.Component.add(ButtonPrintQROrderReceipt);

    return ButtonPrintQROrderReceipt;
});
