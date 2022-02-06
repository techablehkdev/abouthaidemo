odoo.define('pos_retail.GiftCardRow', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class GiftCardRow extends PosComponent {

        constructor() {
            super(...arguments);
        }

        get getHighlight() {
            return this.props.card !== this.props.selectedCard ? '' : 'highlight';
        }
    }

    GiftCardRow.template = 'GiftCardRow';

    Registries.Component.add(GiftCardRow);

    return GiftCardRow;
});
