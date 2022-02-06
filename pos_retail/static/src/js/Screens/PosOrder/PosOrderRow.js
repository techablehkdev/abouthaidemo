odoo.define('pos_retail.PosOrderRow', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;
    const field_utils = require('web.field_utils');

    class PosOrderRow extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({
                refresh: 'done',
            });
        }

        get highlight() {
            return this.props.order !== this.props.selectedOrder ? '' : 'highlight';
        }

        showMore() {
            const order = this.props.order;
            const link = window.location.origin + "/web#id=" + order.id + "&view_type=form&model=pos.order";
            window.open(link, '_blank')
        }
    }

    PosOrderRow.template = 'PosOrderRow';

    Registries.Component.add(PosOrderRow);

    return PosOrderRow;
});
