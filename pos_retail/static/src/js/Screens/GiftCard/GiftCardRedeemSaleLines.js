odoo.define('pos_retail.GiftCardRedeemSaleLines', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class GiftCardRedeemSaleLines extends PosComponent {
        get highlight() {
            return this.props.order !== this.props.selectedOrder ? '' : 'highlight';
        }
    }

    GiftCardRedeemSaleLines.template = 'GiftCardRedeemSaleLines';

    Registries.Component.add(GiftCardRedeemSaleLines);

    return GiftCardRedeemSaleLines;
});
