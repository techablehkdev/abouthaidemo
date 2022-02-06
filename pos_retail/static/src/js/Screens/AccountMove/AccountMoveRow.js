odoo.define('pos_retail.AccountMoveRow', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class AccountMoveRow extends PosComponent {

        get highlight() {
            return this.props.move !== this.props.selectedMove ? '' : 'highlight';
        }
    }

    AccountMoveRow.template = 'AccountMoveRow';

    Registries.Component.add(AccountMoveRow);

    return AccountMoveRow;
});
