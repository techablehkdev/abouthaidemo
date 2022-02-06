odoo.define('pos_retail.ClientScreenWidget', function (require) {
    var models = require('point_of_sale.models');
    var core = require('web.core');
    var QWeb = core.qweb;

    var _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {
            var self = this;
            _super_PosModel.initialize.apply(this, arguments);
            this.bind('change:selectedOrder', function () {
                self._do_update_customer_screen();
            });
            this.bind('refresh.customer.facing.screen', function () {
                self._do_update_customer_screen();
            });
        },
        get_logo: function () { // return logo for posticket web and header top - right
            if (this.config.logo) {
                return 'data:image/png;base64, ' + this.config.logo
            } else {
                return 'data:image/png;base64, ' + this.company.logo
            }
        },
        save_facing_screen: function (facing_screen_html) {
            var self = this;
            localStorage['facing_screen'] = '';
            localStorage['facing_screen'] = facing_screen_html
        },
        _do_update_customer_screen: function () {
            if (this.config.customer_facing_screen) {
                var self = this;
                this.render_html_for_customer_facing_display().then(function (rendered_html) {
                    self.save_facing_screen(rendered_html);
                });
            }
        },
        send_current_order_to_customer_facing_display: function () {
            this._do_update_customer_screen();
            var self = this;
            this.render_html_for_customer_facing_display().then(function (rendered_html) {
                self.proxy.update_customer_facing_display(rendered_html);
            });
        },

        _convert_product_img_to_base64: function (product, url) {
            return new Promise(function (resolve, reject) {
                var img = new Image();

                img.onload = function () {
                    var canvas = document.createElement('CANVAS');
                    var ctx = canvas.getContext('2d');

                    canvas.height = this.height;
                    canvas.width = this.width;
                    ctx.drawImage(this, 0, 0);

                    var dataURL = canvas.toDataURL('image/jpeg');
                    product.image_base64 = dataURL;
                    canvas = null;

                    resolve();
                };
                img.crossOrigin = 'use-credentials';
                img.src = url;
            });
        },

        render_html_for_customer_facing_display: function () { // TODO: we add shop logo to customer screen
            var self = this;
            var order = this.get_order();

            var get_image_promises = [];

            if (order) {
                order.get_orderlines().forEach(function (orderline) {
                    var product = orderline.product;
                    var image_url = `/web/image?model=product.product&field=image_128&id=${product.id}&write_date=${product.write_date}&unique=1`;

                    if (!product.image_base64) {
                        get_image_promises.push(self._convert_product_img_to_base64(product, image_url));
                    }
                });
            }

            return Promise.all(get_image_promises).then(function () {
                return QWeb.render('CustomerFacingDisplayOrder', {
                    pos: self.env.pos,
                    origin: window.location.origin,
                    order: order,
                });
            });
        },
    });

    var _super_order = models.Order.prototype;
    models.Order = models.Order.extend({
        initialize: function (attributes, options) {
            const self = this;
            _super_order.initialize.apply(this, arguments);
            this.bind('add', function (order) {
                self.pos._do_update_customer_screen();
            });
            return this
        }
    });
});
