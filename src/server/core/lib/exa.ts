import Exa from "exa-js";

export const exa: Exa | null = process.env.EXA_API_KEY ? new Exa(process.env.EXA_API_KEY) : null;
