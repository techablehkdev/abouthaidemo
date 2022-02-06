odoo.define('pos_retail.ButtonScanQrCode', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const { useListener } = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');

    class ButtonScanQrCode extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick() {
            await this.showPopup('PopUpScanQrCode', {
                isScanOrder: true
            });
        }

    }

    ButtonScanQrCode.template = 'ButtonScanQrCode';

    ProductScreen.addControlButton({
        component: ButtonScanQrCode,
        condition: function () {
            return true;
        },
        position: ['after', 'ButtonPrintQROrderReceipt'],
    });

    Registries.Component.add(ButtonScanQrCode);

    return ButtonScanQrCode;
});
