import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { ajax } from "discourse/lib/ajax";
import { getIdentity } from "discourse/plugins/discourse-encrypt/lib/discourse";
import { generatePaperKey } from "discourse/plugins/discourse-encrypt/lib/paper-key";
import { exportIdentity } from "discourse/plugins/discourse-encrypt/lib/protocol";

export default class GeneratePaperKey extends Component {
  @tracked paperKey;

  async generate() {
    const paperKey = generatePaperKey();
    const label = this.args.model.device
      ? "device"
      : `paper_${paperKey.substr(0, paperKey.indexOf(" ")).toLowerCase()}`;

    const identity = await getIdentity();
    const exported = await exportIdentity(identity, paperKey);

    this.paperKey = paperKey;

    await ajax("/encrypt/keys", {
      type: "PUT",
      data: {
        public: exported.public,
        private: exported.private,
        label,
      },
    });
  }
}
