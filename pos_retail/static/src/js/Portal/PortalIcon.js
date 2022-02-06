/** @odoo-module **/
import {qweb as QWeb} from 'web.core';
import session from 'web.session';
import SystrayMenu from 'web.SystrayMenu';
import Widget from 'web.Widget';
import Time from 'web.time';
var rpc = require('web.rpc');

const PosPortalHeaderIcon = Widget.extend({
    name: 'PosPortalHeaderIcon',
    template: 'PosPortalHeaderIcon',
    events: {
        'show.bs.dropdown': '_goPOS',
    },
    willStart: function () {
        return this._super();
    },
    start: function () {
        return this._super();
    },
    async _goPOS() {
        window.location = '/web#action=pos_retail.point_of_sale_portal'
    }
});

SystrayMenu.Items.push(PosPortalHeaderIcon);

export default PosPortalHeaderIcon;