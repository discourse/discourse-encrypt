import bodyClass from "discourse/helpers/body-class";

<template>
  {{#if @outletArgs.model.encrypted_title}}
    {{bodyClass "encrypted-topic-page"}}
  {{/if}}
</template>
