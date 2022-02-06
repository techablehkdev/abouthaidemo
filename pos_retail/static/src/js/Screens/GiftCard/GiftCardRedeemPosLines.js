odoo.define('pos_retail.GiftCardRedeemPosLines', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class GiftCardRedeemPosLines extends PosComponent {
        get highlight() {
            return this.props.order !== this.props.selectedOrder ? '' : 'highlight';
        }
    }

    GiftCardRedeemPosLines.template = 'GiftCardRedeemPosLines';

    Registries.Component.add(GiftCardRedeemPosLines);

    return GiftCardRedeemPosLines;
});
