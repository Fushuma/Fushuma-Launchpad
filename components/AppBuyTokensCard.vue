<script setup lang="ts">
    import type { IIcoInfoWithKey } from '~/types/Ico';
    import { SolanaIcoLaunchpad } from '~/js/ico';
    import * as web3 from '@solana/web3.js';
    import { Metaplex } from '~/js/metaplex';
    import { useBalanceStore } from '@/store/balances';
    import { IcoStatus } from '~/js/utils';
    import { convertTokenIfAvailableWithFormatting, getTokenSymbol } from '~/js/tokens';
    import type { DataWrapper } from '~/types/DataWrapper';
    import Web3 from 'web3';
    import { getEvmCostInfo, proxyAddress, getMetaMaskEthereum } from '~/js/ico-evm';
    import { ethers } from 'ethers';
    import LaunchpadABI from '@/abis/Launchpad.json';
    import ERC20ABI from '@/abis/ERC20.json';

    const evmWeb3 = new Web3(window.ethereum);
    const balanceStore = useBalanceStore();

    const provider = getMetaMaskEthereum() ? new ethers.BrowserProvider(getMetaMaskEthereum()) : null;
    const network = provider ? await provider.getNetwork() : {chainId: 0n};

    const fetchBalances = () => {
        balanceStore.clearBalances();
        balanceStore.fetchBalances();
    };

    const toast = useToast();

    const { icoInfo, icoPot, evmMemo, currentPrice } = defineProps<{
        icoInfo: IIcoInfoWithKey;
        icoPot: string;
        evmMemo?: boolean;
        status: IcoStatus;
        currentPrice: DataWrapper<number>;
    }>();
    
    let icoTokenSymbol = await getTokenSymbol(icoInfo.data.icoMint);
    let paymentTokenSymbol = icoInfo.data.costMint === "0x0000000000000000000000000000000000000000" ? "FUMA" : await getTokenSymbol(icoInfo.data.costMint);

    const emits = defineEmits<{
        (e: 'fetch:data'): void;
        (e: 'fetch:purchases'): void;
    }>();

    const isLoading = ref();
    const isPriceLoading = ref();
    const isSetPurchasePrice = ref<boolean>(true);

    const purchaseAmount = ref<number>();
    const purchasePrice = ref<number>();

    const evmChainAddress = ref<string>('');

    const price = ref({
        value: 0,
        availableAmount: 0,
    });

    const signer = await provider.getSigner();

    // Payment token
    const paymentTokenAddress = icoInfo?.data?.costMint;
    const paymentToken = paymentTokenAddress !== "0x0000000000000000000000000000000000000000" ? new ethers.Contract(paymentTokenAddress, ERC20ABI, signer) : null;
    const paymentDecimals = paymentTokenAddress !== "0x0000000000000000000000000000000000000000" ? Number(await paymentToken?.decimals()) : null;

    // ICO token
    const icoTokenAddress = icoInfo?.data?.icoMint;
    const icoToken = new ethers.Contract(icoTokenAddress, ERC20ABI, signer);
    const icoDecimals = Number(await icoToken.decimals());

    const minTokenAmount = computed(() => {
        if (!icoInfo.data) return 0.01;
        return 1 / icoInfo.data!.icoDecimals;
    });

    const bonusProgressValue = computed(() => {
        if (isSetPurchasePrice) {
            if (!icoInfo.data || !price.value?.availableAmount || !tokensToPurchase.value) return 0;
            if( price.value.availableAmount < tokensToPurchase.value) return 0;
            if (icoInfo.data.bonusReserve === 0) return 0;

            const bonusAmount = Math.min(price.value.availableAmount * (icoInfo.data.bonusPercentage / 100 / 100),
                icoInfo.data.bonusReserve / icoInfo.data.icoDecimals
            )
            const maxAmount = icoInfo.data.bonusReserve / icoInfo.data.icoDecimals;

            return Math.min((bonusAmount / maxAmount) * 100, 100);
        } else {
            if (!icoInfo.data || !purchaseAmount.value || !tokensToPurchase.value) return 0;
            if (tokensToPurchase.value > purchaseAmount.value) return 0;
            if (icoInfo.data.bonusReserve === 0) return 0;

            const bonusAmount = Math.min(purchaseAmount.value * (icoInfo.data.bonusPercentage / 100 / 100),
                icoInfo.data.bonusReserve / icoInfo.data.icoDecimals
            )
            const maxAmount = icoInfo.data.bonusReserve / icoInfo.data.icoDecimals;

            return Math.min((bonusAmount / maxAmount) * 100, 100);
        }
    });

    const getPrice = async (tokensAmount?: number) => {
        if (tokensAmount) {
            isPriceLoading.value = true;
            try {
                if (evmMemo) {
                    const id = icoPot.split("-")[1];
                    const decimals = BigInt(icoInfo.data!.icoDecimals);
                    console.log(tokensAmount);
                    const amount = BigInt(tokensAmount) * decimals;
                    const p = await getEvmCostInfo(Number(id), amount);

                    if (!p) throw new Error("Failed to fetch EVM cost info");
                    if(!id && Number(id) <0 ) return null;
                        if(tokensAmount <= 0) return null;

                    price.value = {
                        availableAmount: Number(p.availableAmount) / icoInfo.data!.icoDecimals,
                        value: Number(p.value) / icoInfo.data!.icoDecimals,
                    };

                    // purchaseAmount.value = p.availableAmount;
                    // purchasePrice.value = p.value;
                } else {
                    const p = await SolanaIcoLaunchpad.getPurchaseAmount({
                        icoPot: new web3.PublicKey(icoPot),
                        amount: Number(tokensAmount * icoInfo.data!.icoDecimals),
                    });

                    price.value = {
                        availableAmount: p.availableAmount / icoInfo.data!.icoDecimals,
                        value: p.value / icoInfo.data!.icoDecimals,
                    };

                    purchaseAmount.value = price.value.availableAmount;
                    purchasePrice.value = price.value.value;
                }
                
            } finally {
                isPriceLoading.value = false;
            }
        }
    };

    // const onPurchasePriceChange = (value: number | null) => {
    //     console.log("value", value);
    //     purchasePrice.value = value;
    //     console.log("purchasePrice.value", purchasePrice.value);
    // };

    watch(purchaseAmount, () => getPrice(purchaseAmount.value), { immediate: true });

    // The information is taken from payment token amount but it converts it as if it was 18 decimals
    // This should be fixed to take into account the real decimals of the payment token

    watch(
        purchasePrice,
        async () => {
            if (purchasePrice.value && currentPrice.data) {
                const totalPriceDecimals = purchasePrice.value;

                if(Number(icoInfo.data?.endPrice) == 0 && paymentDecimals) {
                    const tokensAmount = Math.round(totalPriceDecimals * 10**paymentDecimals / currentPrice.data);
                    price.value.availableAmount = tokensAmount / 10**icoDecimals;
                    price.value.value = purchasePrice.value;
                } else if(Number(icoInfo.data?.endPrice) == 0 && !paymentDecimals) {
                    const tokensAmount = Math.round(totalPriceDecimals * 10**18 / currentPrice.data);
                    price.value.availableAmount = tokensAmount / 10**icoDecimals;
                    price.value.value = purchasePrice.value;
                } else {
                    const startPrice = currentPrice.data;
                    const endPrice = Number(icoInfo.data?.endPrice) / (icoInfo.data?.icoDecimals);
                    const maxTokens = icoInfo.data.amount / icoInfo.data?.icoDecimals;
                    const payToBuy = calculateBuyAmount(totalPriceDecimals, startPrice, endPrice, maxTokens);
                    price.value.availableAmount = payToBuy;
                    price.value.value = purchasePrice.value;
                }
                // getPrice(tokensAmount);
            }
        },
        { immediate: true },
    );

    function calculateBuyAmount(paidAmount: number, startPrice: number, endPrice: number, maxTokens: number): number {
        console.log("paidAmount->", paidAmount);
        console.log("startPrice->", startPrice);
        console.log("endPrice->", endPrice);
        console.log("maxTokens->", maxTokens);

        const A = 0.5 * (endPrice - startPrice) / maxTokens;
        const B = startPrice;

        const D = B * B + 4 * A * paidAmount;
        if (D < 0) return 0;

        const n = (-B + Math.sqrt(D)) / (2 * A);
        return n; // token amount user can buy
    }

    const slicedAvailableAmount = computed({
        get: () => {
            return price.value.availableAmount.toFixed(4); // or format however you like
        },
        set: (val) => {
            price.value.availableAmount = Number(val);
        }
    });

    const buy = async () => {
        if (!price.value.availableAmount) return;

        isLoading.value = true;

        try {
            if(evmMemo) {
                const id = icoPot.split("-")[1];
                // 1. Connect to MetaMask
                await provider.send("eth_requestAccounts", []); // prompts MetaMask connect


                // 2. Get signer
                const signer = await provider.getSigner();
                // 3. Use signer with your proxy contract
                const proxyAsLaunchpad = new ethers.Contract(proxyAddress, LaunchpadABI, signer);

                // Send the transaction with the correct parameters
                try {
                    // Estimate gas without including 'value' in the function arguments
                    if(icoInfo?.data?.costMint == "0x0000000000000000000000000000000000000000") {
                        const amountToBuy = price.value.availableAmount * icoInfo.data.icoDecimals;
                        const { availableAmount, value: amountToPay } = await proxyAsLaunchpad.getValue(id, amountToBuy.toString());

                        const { startDate, endDate } = await proxyAsLaunchpad.icoParams(id);
                        const { isClosed } = await proxyAsLaunchpad.icoState(id);
                        const now = Math.floor(Date.now() / 1000); // current timestamp

                        if (now < startDate) {
                            console.error('ICO is not started yet');
                        }
                        if (Number(endDate) !== 0 && now > endDate) {
                            console.error('ICO already finished');
                        }
                        if (isClosed) {
                            console.error('ICO is closed');
                        }

                        // Send transaction with overrides
                        const tx = await proxyAsLaunchpad.buyToken(
                            id,
                            amountToBuy.toString(),
                            signer,
                            {
                                value: amountToPay.toString(),
                            }
                        );

                        console.log("Transaction hash is", tx.hash);
                    } else {
                        // Should track where the available amount value comes from to correct it
                        // The information it gives is wrong, it should be reviewed

                        const amountToBuy = evmWeb3.utils.toWei(price.value.availableAmount, 'ether');
                        const { availableAmount, value: amountToPay } = await proxyAsLaunchpad.getValue(id, amountToBuy);

                        const allowance = await paymentToken.allowance(await signer.getAddress(), proxyAddress);

                        let approveTx;
                        if (allowance < amountToPay) {
                            approveTx = await paymentToken.approve(proxyAddress, amountToPay);
                        }

                        const { startDate, endDate } = await proxyAsLaunchpad.icoParams(id);
                        const { isClosed } = await proxyAsLaunchpad.icoState(id);
                        const now = Math.floor(Date.now() / 1000); // current timestamp

                        if (now < startDate) {
                            console.error('ICO is not started yet');
                        }
                        if (Number(endDate) !== 0 && now > endDate) {
                            console.error('ICO already finished');
                        }
                        if (isClosed) {
                            console.error('ICO is closed');
                        }

                        if((approveTx && await approveTx.wait()) || !approveTx) {
                            // Send transaction with overrides
                            const tx = await proxyAsLaunchpad.buyToken(
                                id,
                                amountToBuy,
                                signer.getAddress()
                            );
                            console.log("Transaction hash is", tx.hash);
                        }
                    }
                    emits('fetch:data');
                    emits('fetch:purchases');
                    fetchBalances();
                    getPrice();
                    resetValues();
                } catch (error) {
                    console.log("error", error);
                }
            } else {
                toast.add({
                    title: 'Preparing transaction',
                    icon: 'i-lucide-info',
                    description: 'Please wait for the transaction.',
                    color: 'info',
                });

                const txSig = await SolanaIcoLaunchpad.buyToken({
                    icoPot: new web3.PublicKey(icoPot),
                    evmChainAddress: evmMemo ? evmChainAddress.value : undefined,
                    amountWithDecimals: price.value.availableAmount * icoInfo.data!.icoDecimals,
                });

                toast.add({
                    title: 'Confirming transaction',
                    icon: 'i-lucide-info',
                    description: 'Please wait for the transaction.',
                    color: 'info',
                });

                if (txSig) {
                    await Metaplex.getInstance().confirmTransaction(txSig);
                }

                toast.add({
                    title: 'Success',
                    icon: 'i-lucide-check-circle',
                    description: 'Your action was completed successfully.',
                    color: 'success',
                });

                emits('fetch:data');
                emits('fetch:purchases');
                fetchBalances();
                getPrice();
                resetValues();
            }
        } catch (e) {
            toast.add({
                title: 'Uh oh! Something went wrong.',
                description: 'There was a problem with your request.',
                icon: 'i-lucide-alert-circle',
                close: {
                    color: 'primary',
                    variant: 'outline',
                    class: 'rounded-full',
                },
            });
        } finally {
            isLoading.value = false;
        }
    };

    const tokensToPurchase = computed(() => {
        return (icoInfo.data.amount / icoInfo.data.icoDecimals) * (icoInfo.data?.bonusActivator / 100 / 100);
    });

    const isStableSale = computed(() => {
        return icoInfo.data.endPrice == BigInt(0);
    });

    const resetValues = () => {
        purchaseAmount.value = undefined;
        purchasePrice.value = undefined;
        price.value.availableAmount = 0;
        price.value.value = 0;
    };

    const customTitles = () => {
        if (
            icoInfo.data.costMint === "0x1e11d176117dbEDbd234b1c6a10C6eb8dceD275e" ||
            icoInfo.data.costMint === "0xf8EA5627691E041dae171350E8Df13c592084848"
        ) {
            return `Buy ${icoTokenSymbol} with ${paymentTokenSymbol} from Ethereum chain`
        } else {
            return `Buy ${icoTokenSymbol} with ${paymentTokenSymbol}`
        }
    }
</script>

<template>
    <div class="bg-white shadow-sm py-6 px-4 space-y-3" v-if="Number(network.chainId) === 121224 && evmMemo">
        <h1 class="font-semibold expletus text-xl tracking-tight mb-1">
            {{ customTitles() }}
        </h1>
        <p v-if="isStableSale" class="text-sm mb-6 text-black/60 dark:text-white/5s0">
            Please specify the amount of tokens you wish to purchase or the buy amount.
        </p>
        <p v-else class="text-sm text-black/60 mb-6 dark:text-white/50">
            Please specify the amount of tokens you wish to purchase. Buy amount is not available for dynamic token
            prices.
        </p>

        <div
            v-if="status === IcoStatus.SoldOut"
            class="text-sm text-white bg-gradient-to-r mt-3 flex items-center space-x-1.5 -mx-4 from-primary-500 via-transparent to-transparent py-3 px-6 font-bold"
        >
            <Icon name="lucide:octagon-x" class="text-white text-xl w-4 h-4" />
            <span>Tokens are sold out</span>
        </div>

        <div
            v-else-if="status === IcoStatus.Ended"
            class="text-sm text-white bg-gradient-to-r mt-3 flex items-center space-x-1.5 -mx-4 from-primary-500 to-white py-3 px-6 font-bold"
        >
            <Icon name="lucide:octagon-x" class="text-white text-xl w-4 h-4" />
            <span>Sale has ended</span>
        </div>

        <div
            v-else-if="status === IcoStatus.Upcoming"
            class="text-sm text-white bg-gradient-to-r mt-3 flex items-center space-x-1.5 -mx-4 from-primary-500 to-white py-3 px-6 font-bold"
        >
            <Icon name="lucide:octagon-x" class="text-white text-xl w-4 h-4" />
            <span>Sale has not started yet</span>
        </div>

        <div
            v-else-if="status === IcoStatus.Closed"
            class="text-sm text-white bg-gradient-to-r mt-3 flex items-center space-x-1.5 -mx-4 from-primary-500 to-white py-3 px-6 font-bold"
        >
            <Icon name="lucide:octagon-x" class="text-white text-xl w-4 h-4" />
            <span>Sale is closed</span>
        </div>

        <div v-else>
            <!-- <div v-if="isStableSale" class="border py-1.5 px-4 -mx-4 border-gray-100 flex items-center my-6">
                <p class="text-sm mr-3 block font-medium text-(--ui-text)">Buy Amount</p>
                <USwitch v-model="isSetPurchasePrice" @update:model-value="resetValues" label="Pay Amount" />
            </div> -->

            <div class="w-full md:items-end md:grid flex max-w-2/3 flex-col grid-cols-3 gap-3">
                <UFormField v-if="isSetPurchasePrice" label="Pay Amount" required number>
                    <UInputNumber v-if="!evmMemo"
                        class="w-full"
                        placeholder="0"
                        style="text-align: left;"
                        :step="minTokenAmount"
                        :min="minTokenAmount"
                        v-model="purchasePrice"
                        :format-options="{
                            maximumFractionDigits: 9,
                        }"
                    >
                        <template #decrement>
                            <span />
                        </template>
                        <template #increment>
                            <span class="px-1">{{ convertTokenIfAvailableWithFormatting(icoInfo.data.costMint) }}</span>
                        </template>
                    </UInputNumber>

                    <UInputNumber v-if="evmMemo" 
                    style="text-align: left;"
                    :step="0.01"
                    :min="0"
                    class="w-full" 
                    placeholder="0"
                    v-model="purchasePrice">
                        <template #decrement>
                            <span />
                        </template>
                        <template #increment>
                            <span class="px-1">{{ paymentTokenSymbol }}</span>
                        </template>
                    </UInputNumber>
                </UFormField>

                <UFormField v-if="isSetPurchasePrice" label="You Receive">
                    <UInputNumber
                        class="w-full"
                        style="text-align: left;"
                        :format-options="{
                            roundingMode: 'expand',
                            roundingPriority: 'morePrecision',
                        }"
                        variant="subtle"
                        readonly
                        v-model="slicedAvailableAmount"
                        v-if="!evmMemo"
                        :disabled="true"
                    >
                        <template #decrement>
                            <span />
                        </template>
                        <template #increment>
                            <AppSpinner v-if="isPriceLoading" :size="2" class="ml-2" />
                            <span v-else class="px-1">{{
                                convertTokenIfAvailableWithFormatting(icoInfo.data.icoMint)
                            }}</span>
                        </template>
                    </UInputNumber>

                    <UInputNumber
                        class="w-full"
                        style="text-align: left;"
                        :format-options="{
                            roundingMode: 'expand',
                            roundingPriority: 'morePrecision',
                        }"
                        variant="subtle"
                        readonly
                        v-model="slicedAvailableAmount"
                        v-if="evmMemo"
                        :disabled="true"
                    >
                        <template #decrement>
                            <span />
                        </template>
                        <template #increment>
                            <AppSpinner v-if="isPriceLoading" :size="2" class="ml-2" />
                            <span v-else class="px-1">{{
                                icoTokenSymbol
                            }}</span>
                        </template>
                    </UInputNumber>
                </UFormField>

                <UFormField v-if="!isSetPurchasePrice" label="Buy Amount" required number>
                    <UInputNumber class="w-full" v-if="!evmMemo" type="number" v-model="purchaseAmount">
                        <template #decrement>
                            <span />
                        </template>
                        <template #increment>
                            <span class="px-1">{{ convertTokenIfAvailableWithFormatting(icoInfo.data.icoMint) }}</span>
                        </template>
                    </UInputNumber>
                    <UInputNumber class="w-full" v-if="evmMemo" type="number" v-model="purchaseAmount">
                        <template #decrement>
                            <span />
                        </template>
                        <template #increment>
                            <span class="px-1">{{ icoTokenSymbol }}</span>
                        </template>
                    </UInputNumber>
                </UFormField>

                <UFormField v-if="!isSetPurchasePrice" label="You Pay">
                    <UInputNumber
                        class="w-full"
                        :format-options="{
                            roundingMode: 'expand',
                            roundingPriority: 'morePrecision',
                        }"
                        variant="subtle"
                        readonly
                        v-model="price.value"
                        v-if="evmMemo"
                    >
                        <template #decrement>
                            <span />
                        </template>
                        <template #increment>
                            <AppSpinner v-if="isPriceLoading" :size="2" class="ml-2" />
                            <span v-else class="px-1">{{
                               paymentTokenSymbol
                            }}</span>
                        </template>
                    </UInputNumber>
                    <UInputNumber
                        class="w-full"
                        :format-options="{
                            roundingMode: 'expand',
                            roundingPriority: 'morePrecision',
                        }"
                        variant="subtle"
                        readonly
                        v-model="price.value"
                        v-if="!evmMemo"
                    >
                        <template #decrement>
                            <span />
                        </template>
                        <template #increment>
                            <AppSpinner v-if="isPriceLoading" :size="2" class="ml-2" />
                            <span v-else class="px-1">{{
                               convertTokenIfAvailableWithFormatting(icoInfo.data.costMint)
                            }}</span>
                        </template>
                    </UInputNumber>
                </UFormField>
                <UFormField
                    v-if="!evmMemo"
                    required
                    label="Fushuma Chain Address"
                    class="flex flex-col justify-end"
                >
                    <UInput class="w-full text-center" v-model="evmChainAddress" />
                    <div class="absolute text-xs text-gray-500 mt-2 leading-tight whitespace-nowrap">
                        Only required if the ICO is conducted on Solana chain.
                    </div>
                </UFormField>
                <br>
                <UButton
                    :class="!purchaseAmount || (isLoading && 'cursor-not-allowed')"
                    :loading="isLoading"
                    class="w-fit max-h-[48px] h-[36px] px-6 dark:text-white mt-4 md:mt-0"
                    @click="buy"
                    >Buy {{ evmMemo ? icoTokenSymbol : convertTokenIfAvailableWithFormatting(icoInfo.data.icoMint) }}</UButton
                >
            </div>
        </div>

        <div
            v-if="status === IcoStatus.Live && icoInfo.data?.bonusReserve && icoInfo.data.bonusReserve > 0"
            class="mt-6 w-full md:w-1/2"
        >
            <p class="text-sm text-black/60 dark:text-white/50 mb-2">Bonus activation progress</p>
            <UProgress v-model="bonusProgressValue" />
            <div v-if="isSetPurchasePrice">
                <!-- <p v-if="!price.value.availableAmount || price.value.availableAmount < tokensToPurchase" class="text-sm mt-2 text-primary-500"> -->
                <p v-if="!price.availableAmount || price.availableAmount < tokensToPurchase" class="text-sm mt-2 text-primary-500">
                    You need
                    {{ Intl.NumberFormat('en-us', { style: 'decimal' }).format(tokensToPurchase - (price.availableAmount ?? 0)) }}
                    {{ evmMemo ? icoTokenSymbol : 'tokens' }} more to activate the bonus
                </p>

                <p v-else class="text-sm mt-1 text-primary-500">
                    You will receive
                    {{
                        Intl.NumberFormat('en-us', { style: 'decimal' }).format(
                            Math.min(
                                price.availableAmount * (icoInfo.data.bonusPercentage / 100 / 100),
                                icoInfo.data.bonusReserve / icoInfo.data.icoDecimals
                            ),
                        )
                    }}
                    bonus {{ evmMemo ? icoTokenSymbol : 'tokens' }}
                </p>
            </div>
            <div v-else>
                <p v-if="!purchaseAmount || purchaseAmount < tokensToPurchase" class="text-sm mt-2 text-primary-500">
                    You need
                    {{ Intl.NumberFormat('en-us', { style: 'decimal' }).format(tokensToPurchase - (purchaseAmount ?? 0)) }}
                    {{ evmMemo ? icoTokenSymbol : 'tokens' }} more to activate the bonus.
                </p>
                
                <p v-else class="text-sm mt-1 text-primary-500">
                    You will receive
                    {{
                        Intl.NumberFormat('en-us', { style: 'decimal' }).format(
                            Math.min(
                                purchaseAmount * (icoInfo.data.bonusPercentage / 100 / 100),
                                icoInfo.data.bonusReserve / icoInfo.data.icoDecimals
                            )
                        )
                    }}
                    bonus {{ evmMemo ? icoTokenSymbol : 'tokens' }}!
                </p>
            </div>
        </div>
    </div>
    <div class="bg-white shadow-sm py-6 px-4 space-y-3" v-else>
        <p>Please Switch to Fushuma.</p>
    </div>
</template>

<style scoped></style>
