odoo.define('pos_retail.QrOrderReceipt', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;

    class QrOrderReceipt extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({
                order: this.props.order,
            });
        }

    }

    QrOrderReceipt.template = 'QrOrderReceipt';

    Registries.Component.add(QrOrderReceipt);

    return QrOrderReceipt;
});
