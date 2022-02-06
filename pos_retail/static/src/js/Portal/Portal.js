odoo.define('pos_retail.Portal', function (require) {
    "use strict";

    var AbstractAction = require('web.AbstractAction');
    var core = require('web.core');
    var QWeb = core.qweb;
    var _t = core._t;
    var session = require('web.session');
    var Widget = require('web.Widget');


    const PointOfSalePortal = AbstractAction.extend({
        events: {
            "click .o_pos_login": _.debounce(function (event) {
                const posID = parseInt(event.target.id)
                this.loginPOS(posID)
            }, 200, true),
            "click .o_pos_logout": _.debounce(function (event) {
                window.location = '/web/session/logout'
            }, 200, true),
            "click .o_pos_backend": _.debounce(function (event) {
                window.location = '/web#action=point_of_sale.action_client_pos_menu'
            }, 200, true),
        },

        async start() {
            this.currentSession = this.getSession()
            const users = await this._rpc({
                model: 'res.users',
                method: 'search_read',
                args: [[['id', '=', this.currentSession.uid]]],
            })
            const user = users[0]
            if (!user.pos_portal_user) {
                window.location = '/web#action=point_of_sale.action_client_pos_menu';
            }
            const pos_config_ids = user.pos_config_ids
            if (user.pos_config_id) {
                pos_config_ids.push(user.pos_config_id[0])
            }

            let pos_configs = await this._rpc({
                model: 'pos.config',
                method: 'search_read',
                args: [[['id', 'in', pos_config_ids]], ['current_user_id', 'name', 'current_session_state', 'pos_session_username']],
            })
            this.user = user
            this.pos_configs = pos_configs
            this.$el.html(QWeb.render("PointOfSalePortal", {widget: this}));
        },

        async loginPOS(posID) {
            this.posLogin = this.pos_configs.find(b => b.id == posID)
            if (this.posLogin.current_user_id && this.posLogin.current_user_id[0] != this.user.id) {
                return this.do_notify(
                    _t("Warning, 1 POS only access Only One User Account"),
                    _t("Opened by another User, you need request ") + this.posLogin.current_user_id[1] + _t(" close this Session first ."));
            }
            window.location = '/pos/web?config_id=' + posID
        },
    });

    core.action_registry.add('PointOfSalePortal', PointOfSalePortal);
    return PointOfSalePortal;
});