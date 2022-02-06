odoo.define('pos_retail.PopUpShareQrCode', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const contexts = require('point_of_sale.PosContext');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {useListener} = require('web.custom_hooks');

    class PopUpShareQrCode extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {}
            this.state = useState(this.change);
            this.orderUiState = useContext(contexts.orderManagement);
            useListener('close-this-popup', this.cancel);
            NumberBuffer.use({
                triggerAtEnter: 'accept-input',
                triggerAtEscape: 'close-this-popup',
            });
        }
    }

    PopUpShareQrCode.template = 'PopUpShareQrCode';
    PopUpShareQrCode.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpShareQrCode);

    return PopUpShareQrCode
});
