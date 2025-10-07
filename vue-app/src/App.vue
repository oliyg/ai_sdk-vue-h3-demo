<script setup lang="ts">
import { Chat } from '@ai-sdk/vue';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { DefaultChatTransport } from 'ai';
import { ref, onMounted, watch } from 'vue';

const input = ref('Generate an article about ai agent in casual tone.');
const chat = new Chat({
  transport: new DefaultChatTransport({ api: 'http://localhost:3001/chat' }),
  // sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  async onToolCall({ toolCall }) {
    if (toolCall.dynamic) {
      return;
    }
    if (toolCall.toolName === 'showFinalAnswer') {
      chat.addToolResult({
        tool: 'showFinalAnswer',
        toolCallId: toolCall.toolCallId,
        output: 'ok',
      });
      chat.sendMessage()
    }
  }
});

watch(() => chat.messages, (val) => {
  console.log(Date.now(), new Date(Date.now()).toLocaleTimeString())
  console.log('chunk', val)
}, { deep: true })

const handleSubmit = (e: Event) => {
  e.preventDefault();
  chat.sendMessage({ text: input.value });
};


</script>

<template>
  <div>
    <div v-for="message in chat.messages" :key="message.id">
      <div>{{ message.role }}:</div>

      <div style="white-space: pre-wrap;" v-for="(part, idx) in message.parts" :key="idx">
        <span style="color: red" v-if="part.type === 'reasoning'">{{ part.text }}</span>
        <span v-if="part.type === 'text'">{{ part.text }}</span>

        <template v-else-if="part.type === 'tool-askForConfirmation'">
          <div :key="part.toolCallId">
            <div v-if="part.state === 'input-streaming'">Loading confirmation...</div>
            <div v-if="part.state === 'input-available'">
              <div>{{ part.input.message || 'Do you confirm?' }}</div>
              <div>
                <button @click="() => {
                  chat.addToolResult({
                    tool: 'askForConfirmation',
                    toolCallId: part.toolCallId,
                    output: 'Yes, confirmed.'
                  })
                  chat.sendMessage();
                }">Yes</button>
                <button @click="() => {
                  chat.addToolResult({
                    tool: 'askForConfirmation',
                    toolCallId: part.toolCallId,
                    output: 'No, I do not confirm.'
                  })
                  chat.sendMessage();
                }">No</button>
              </div>
            </div>
            <div v-if="part.state === 'output-available'">
              Confirmed: {{ part.output }}
            </div>
            <div v-if="part.state === 'output-error'">
              Error: {{ part.errorText }}
            </div>
          </div>
        </template>

        <template v-else-if="part.type === 'tool-showFinalAnswer'">
          <div :key="part.toolCallId">
            <div v-if="part.state === 'input-streaming'">Generating final answer...</div>
            <div v-if="part.state === 'input-available'">
              <div style="border: 1px solid green;">{{ part.input.message }}</div>
            </div>
            <div v-if="part.state === 'output-available'">
              <div style="border: 1px solid green;">{{ part.input.message }}</div>
              Confirmed: {{ part.output }}
            </div>
            <div v-if="part.state === 'output-error'">
              Error: {{ part.errorText }}
            </div>
          </div>
        </template>

        <template v-else-if="part.type === 'tool-generateOutline'">
          <div :key="part.toolCallId">
            <div v-if="part.state === 'input-streaming'">Outline requesting...</div>
            <div v-else-if="part.state === 'input-available'">
              <div>Generating outline...</div>
            </div>
            <div v-else-if="part.state === 'output-available'">
              Outline: {{ part.output.outline }}
            </div>
            <div v-else-if="part.state === 'output-error'">
              Error generating outline: {{ part.errorText }}
            </div>
          </div>
        </template>

        <template v-else-if="part.type === 'tool-generateDraft'">
          <div :key="part.toolCallId">
            <div v-if="part.state === 'input-streaming'">Draft requesting...</div>
            <div v-else-if="part.state === 'input-available'">
              <div>Generating draft...</div>
            </div>
            <div v-else-if="part.state === 'output-available'">
              Draft: {{ part.output.draft }}
            </div>
            <div v-else-if="part.state === 'output-error'">
              Error generating draft: {{ part.errorText }}
            </div>
          </div>
        </template>
      </div>
    </div>

    <input v-model="input"></input>
    <button @click="handleSubmit">send</button>

    <div style="white-space: pre-wrap;">
      {{ JSON.stringify(chat.messages, null, 2) }}
    </div>
  </div>
</template>
