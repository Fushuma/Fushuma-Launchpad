import { ethers, JsonRpcProvider } from "ethers";
import ERC20_ABI from "@/abis/ERC20.json";

export const TokenAddress = new Map<string, string>([
    ['So11111111111111111111111111111111111111112', 'wSOL'],
    ['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'USDC'],
    ['0x0000000000000000000000000000000000000000', 'FUMA'],
]);

export const convertTokenIfAvailable = (token: string) => {
    return TokenAddress.has(token) ? TokenAddress.get(token) : token;
};

export const convertTokenIfAvailableWithFormatting = (token: string) => {
    return TokenAddress.has(token) ? TokenAddress.get(token) : token.slice(0, 4) + '...' + token.slice(-4);
};

export const getTokenSymbol = async(token: string) => {
    const provider = new JsonRpcProvider("https://rpc.fushuma.com");

    try {
        const contract = new ethers.Contract(token, ERC20_ABI, provider);
        const name = await contract.symbol();
        return name;
    } catch (error) {
        return "Unknown";
    }
}

export const getTokenDecimals = async(token: string) => {
    const provider = new JsonRpcProvider("https://rpc.fushuma.com");

    try {
        const contract = new ethers.Contract(token, ERC20_ABI, provider);
        const decimals = await contract.decimals();
        return Number(decimals);
    } catch (error) {
        return 0;
    }
}