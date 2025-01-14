import {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder,
} from "discord.js";
import { chat } from "../modules/gpt-api.js";
import supabase from "../modules/supabase.js";
import { v4 as uuidv4 } from "uuid";
import { useToken } from "../modules/loadbalancer.js";
import chatSonic from "../modules/sonic.js";
import { isPremium } from "../modules/premium.js";

export default {
  cooldown: "1m",
  data: new SlashCommandBuilder()
    .setName("chat")
    .setDescription("Chat with an AI")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("The message for the AI")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("model")
        .setDescription("The model you want to use for the AI.")
        .setRequired(true)
        .addChoices(
          { name: "gpt-3", value: "gpt-3" },
          { name: "ChatSonic (Like ChatGPT)", value: "chatsonic" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("conversation")
        .setDescription(
          "Select if you want to preserver context from the previous messages"
        )
        .setRequired(false)
        .addChoices({ name: "Isolated message", value: "false" })
    ),
  /*
    .addStringOption((option) =>
      option
        .setName("response")
        .setDescription("The type of resoibse message that you want")
        .setRequired(false)
        .addChoices(
          { name: "image", value: "image" },
          { name: "text", value: "text" }
        )
    )*/ async execute(interaction, client, commands, cooldownAction) {
    await interaction.deferReply();

    var message = interaction.options.getString("message");
    var model = interaction.options.getString("model");
    var responseType = interaction.options.getString("response");
    var conversationMode = interaction.options.getString("conversation");

    if (!responseType) {
      responseType = "text";
    }
    if (!conversationMode) conversationMode = false;
    if (conversationMode == "true") conversationMode = true;
    if (conversationMode == "false") conversationMode = false;

    var result;
    var cached = false;
    var ispremium = await isPremium(interaction.user.id);

    if (model == "gpt-3") {
      if (conversationMode == false) {
        let { data: results, error } = await supabase
          .from("results")
          .select("*")

          // Filters
          .eq("prompt", message.toLowerCase())
          .eq("provider", "gpt-3");
        if (!results || error) {
          var errr = "Error connecting with db";

          await responseWithText(interaction, message, errr, channel, "error");
          return;
        }
        if (results[0] && results[0].result.text) {
          var type = "gpt-3";

          result = { text: results[0].result.text, type: type };
          const { data, error } = await supabase
            .from("results")
            .update({ uses: results[0].uses + 1 })
            .eq("id", results[0].id);
          cached = true;
        } else {
          console.log(interaction.user.tag, ispremium);
          result = await chat(message, interaction.user.username, ispremium);
        }
      }
    }
    if (model == "chatsonic") {
      let { data: results, error } = await supabase
        .from("results")
        .select("*")

        // Filters
        .eq("prompt", message.toLowerCase())
        .eq("provider", "chatsonic");
      if (!results || error) {
        var errr = "Error connecting with db";

        await responseWithText(interaction, message, errr, channel, "error");
        return;
      }
      if (results[0] && results[0].result.text) {
        var type = "chatsonic";
        result = { text: results[0].result.text, type: type };
        const { data, error } = await supabase
          .from("results")
          .update({ uses: results[0].uses + 1 })
          .eq("id", results[0].id);
        cached = true;
      } else {
        result = await chatSonic(message);
      }
    }
    if (!result) {
      await responseWithText(
        interaction,
        message,
        `Something wrong happened, please wait we are solving this issue [dsc.gg/turing](https://dsc.gg/turing)`,
        channel,
        "error"
      );
      return;
    }
    if (!result.error) {
      var response = result.text;
      const { data, error } = await supabase.from("results").insert([
        {
          provider: model,
          version: result.type,
          prompt: message.toLowerCase(),
          result: { text: response },
          guildId: interaction.guildId,
        },
      ]);

      var channel = interaction.channel;
      if (!interaction.channel) channel = interaction.user;

      await responseWithText(
        interaction,
        message,
        response,
        channel,
        result.type
      );
    } else {
      await responseWithText(
        interaction,
        message,
        result.error,
        channel,
        "error"
      );
    }
    return;
  },
};

async function responseWithText(interaction, prompt, result, channel, type) {
  var completeResponse = `**Human:** ${prompt}\n**AI(${type}):** ${result}`;
  var charsCount = completeResponse.split("").length;
  if (charsCount / 2000 >= 1) {
    var loops = Math.ceil(charsCount / 2000);
    for (var i = 0; i < loops; i++) {
      if (i == 0) {
        try {
          interaction.editReply(
            completeResponse.split("").slice(0, 2000).join("")
          );
        } catch (err) {
          console.log(err);
        }
      } else {
        channel.send(
          completeResponse
            .split("")
            .slice(2000 * i, 2000 * i + 2000)
            .join("")
        );
      }
    }
  } else {
    interaction.editReply(completeResponse);
  }
}
