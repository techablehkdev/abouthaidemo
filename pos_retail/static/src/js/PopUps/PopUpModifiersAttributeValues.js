odoo.define('pos_retail.PopUpModifiersAttributeValues', function (require) {
    'use strict';

    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;

    class PopUpModifiersAttributeValues extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {
                productAttributes: this.props.productAttributes
            }
            this.state = useState({
                productAttributes: this.props.productAttributes,
                valuesSelected: this.props.valuesSelected
            });
            this.valuesSelected = this.props.valuesSelected
        }

        pickValue(value_id) {
            const self = this;
            const value = this.env.pos.product_attribute_value_by_id[value_id]
            const product_attribute = this.env.pos.product_attribute_by_id[value['attribute_id'][0]]

            if (!this.valuesSelected.includes(value_id)) {
                this.valuesSelected.forEach(v_id => {
                    let valueSelected = self.env.pos.product_attribute_value_by_id[v_id]
                    if (valueSelected.attribute_id && valueSelected.attribute_id[0] == product_attribute.id && !product_attribute['multi_choice']) {
                        self.valuesSelected = self.valuesSelected.filter(v_id => v_id != valueSelected.id)
                    }
                })
                this.valuesSelected.push(value_id)
            } else {
                this.valuesSelected = this.valuesSelected.filter(id => id != value_id)
            }
            this.state.valuesSelected = this.valuesSelected
            this.render()
        }

        getPayload() {
            const self = this
            let valuesByAttributeId = {}
            this.valuesSelected.forEach(v_id => {
                let value = self.env.pos.product_attribute_value_by_id[v_id]
                let attribute_id = value.attribute_id[0]
                if (!valuesByAttributeId[attribute_id]) {
                    valuesByAttributeId[attribute_id] = [v_id]
                } else {
                    valuesByAttributeId[attribute_id].push(v_id)
                }
            })
            return valuesByAttributeId
        }
    }

    PopUpModifiersAttributeValues.template = 'PopUpModifiersAttributeValues';
    PopUpModifiersAttributeValues.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpModifiersAttributeValues);

    return PopUpModifiersAttributeValues
});
