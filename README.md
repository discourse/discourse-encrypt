# discourse-encrypt [![Build Status](https://travis-ci.org/discourse/discourse-encrypt.svg?branch=master)](https://travis-ci.org/discourse/discourse-encrypt)

Discourse Encrypt is a plugin that provides a secure communication channel
through Discourse. [Read more about the plugin on Meta...](https://meta.discourse.org/t/discourse-encrypt-for-private-messages/107918)

## Installation

Follow [Install a Plugin](https://meta.discourse.org/t/install-a-plugin/19157)
how-to from the official Discourse Meta, using `git clone https://github.com/discourse/discourse-encrypt.git`
as the plugin command.

Please note that WebCrypto API is restricted to secure origins, which basically
means that you must enable HTTPS before using this plugin.
