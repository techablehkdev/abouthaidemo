odoo.define('point_of_sale.SyncBackEnd', function (require) {
    'use strict';

    const {useState} = owl;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const Session = require('web.Session')
    const {posbus} = require('point_of_sale.utils');

    class SyncBackEnd extends PosComponent {
        constructor() {
            super(...arguments);
            const synch = {
                status: 'connected',
                msg: ''
            }
            this.state = useState({status: synch.status, msg: synch.msg});
        }

        async onClick() {
            let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                title: this.env._t('POS Screen will block for sync products and customers few times.'),
                body: this.env._t('Are you ready want do it now ?'),
                confirmText: this.env._t('Ok'),
                cancelText: this.env._t('Close')
            })
            if (confirmed) {
                this.state.status = 'connecting'
                this.state.msg = this.env._t('Syncing Products and Customers')
                const serverOrigin = this.env.pos.session.origin;
                const connection = new Session(void 0, serverOrigin, {
                    use_cors: true
                });
                const pingServer = await connection.rpc('/pos/passing/login', {}).then(function (result) {
                    return result
                }, function (error) {
                    return false;
                })
                if (!pingServer) {
                    this.state.status = 'error'
                    this.state.msg = this.env._t('Odoo Server Offline')
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Odoo Server Offline'),
                        body: this.env._t('Your internet or Odoo server Offline, not possible refresh POS Database Cache')
                    })
                }
                await this.env.pos.syncProductsPartners()
                // this.render()
                // // remove all call logs and cache logs of backend
                // await this.rpc({
                //     model: 'pos.query.log',
                //     method: 'clearLogs',
                //     args: [[]],
                // })
                // // remove cache browse
                // indexedDB.deleteDatabase(odoo.session_info.db + '_master_DB');
                // if (this.env.pos.config.cache == 'iot') {
                //     const iotUrl = 'http://' + odoo.proxy_ip + ':8069'
                //     const iotConnection = new Session(void 0, iotUrl, {
                //         use_cors: true
                //     });
                //     await iotConnection.rpc('/hw_cache/reset', {})
                // }
                // remove pos database, next starting pos will reinstall all pos query logs
                // this.env.pos.remove_indexed_db()
                // this.env.pos.reload_pos()
                this.state.status = 'connected'
                this.showPopup('ConfirmPopup', {
                    title: this.env._t('Sync Successfully !!!'),
                    body: this.env._t('POS datas products and customers sync successfully !'),
                })
            }
        }
    }

    SyncBackEnd.template = 'SyncBackEnd';

    Registries.Component.add(SyncBackEnd);

    return SyncBackEnd;
});
