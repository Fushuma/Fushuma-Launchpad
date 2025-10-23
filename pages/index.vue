<template>
    <div>
        <div
            style="background-color: transparent"
            class="flex bg-gray-50 !dark:!bg-black/70 relative md:min-h-[calc(100vh-440px)] pt-[40px] lg:pt-[px] flex-col items-center"
        >
            <div
                v-if="!data?.fetched"
                class="absolute top-1/2 w-fit left-1/2 -translate-x-1/2 -translate-y-1/2"
            >
                <div class="md:flex items-center justify-center w-fit md:space-x-3">
                    <AppSpinner :size="4"></AppSpinner>
                </div>
            </div>

            <div v-else class="container mx-auto px-4 grid-cols-1 md:grid-cols-9 w-full">
                <div class="md:col-start-2 xl:col-start-3 col-span-7 xl:col-span-5 h-full mx-auto gap-6 mb-3 w-full">
                    <div class="items-center" style="margin: 0 15px;">
                        <h1 class="main-page-title" style="font-family: 'Expletus Sans', sans-serif;">Fushuma Launchpad</h1>
                        <p>Create your own ICO <a href="/create-ico" style="font-weight: 600;">here</a>.</p>

                        

                        <AppStateCard error class="mt-6 text-center" v-if="data.fetched && data.error"
                            >Failed to load data</AppStateCard
                        >

                        <AppStateCard class="mt-5" v-else-if="!data?.data?.length && data.fetched">
                            <p class="text-sm text-left text-black/60 font-normal tracking-tight max-w-5xl">
                                No launchpad are published right now.
                            </p>
                        </AppStateCard>

                        <div
                            v-if="data.fetched && data.data?.length && !data.error"
                            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 my-12"
                        >
                            <AppLaunchpadCard
                                v-for="(item, index) in data.data"
                                :launchpad="launchpads.find((el) => el.key === item.key)"
                                :key="index"
                                :data="item"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import Web3 from 'web3';
    import { DataWrapper } from '@/types/DataWrapper';
    import { SolanaIcoLaunchpad } from '@/js/ico';
    import { useWallet } from 'solana-wallets-vue';
    import { gsap } from 'gsap';
    import launchpads from '@/assets/launchpads.json';
    import { fetchAllICOs } from '~/js/ico-evm';
    import { getStatus } from '~/js/utils';


    const { publicKey } = useWallet();
    const launchpadText = ref<HTMLElement | null>(null);

    const hasConnectedWallet = computed(() => {
        return publicKey.value;
    });

    import type { IIcoInfoWithKey } from '@/types/Ico';

    const data = ref(new DataWrapper<IIcoInfoWithKey[]>());

    onMounted(async () => {
        await fetchData();

        setTimeout(() => {
            if (launchpadText.value) {
                gsap.to(launchpadText.value, {
                    opacity: 1,
                    delay: 1,
                    y: 0,
                    duration: 1,
                    ease: 'power1.in',
                });
            }
        }, 3000);
    });

    const fetchData = async () => {
        try {
            const evmIcos = await fetchAllICOs();
            const ignoredIcos = [0];
            const filteredIcos = evmIcos.filter((ico: any) => !ignoredIcos.includes(ico.data.seed));

            // const solanaIcos = await SolanaIcoLaunchpad.getAllIco({});

            // filteredIcos.forEach((pitch: any) => {
            //   pitch.data.startDate *= 1000;
            //    pitch.data.endDate *= 1000;
            //});

            // const combined = [...evmIcos, ..solanaIcos];

            let livelaunchpads = filteredIcos.filter((ico) => {
                return getStatus(
                    Number(ico.data.isClosed),
                    Number(ico.data.amount),
                    Number(ico.data.totalSold),
                    String(ico.data.startDate),
                    String(Date.now()),
                    String(ico.data.endDate)
                ).status === "Live";
            });

            livelaunchpads.sort((a, b) => {
                if (a.data.seed === 18 && b.data.seed !== 18) return -1;
                if (b.data.seed === 18 && a.data.seed !== 18) return 1;

                if (a.data.seed === 19 && b.data.seed !== 19) return -1;
                if (b.data.seed === 19 && a.data.seed !== 19) return 1;

                if (a.data.startDate > b.data.startDate) return -1;
                else return 1;
            });

            let upcominglaunchpads = filteredIcos.filter((ico) => {
                return getStatus(
                    Number(ico.data.isClosed),
                    Number(ico.data.amount),
                    Number(ico.data.totalSold),
                    String(ico.data.startDate),
                    String(Date.now()),
                    String(ico.data.endDate)
                ).status === "Upcoming";
            });

            upcominglaunchpads.sort((a, b) => (a.data.startDate > b.data.startDate ? -1 : 1));

            let soldoutlaunchpads = filteredIcos.filter((ico) => {
                return getStatus(
                    Number(ico.data.isClosed),
                    Number(ico.data.amount),
                    Number(ico.data.totalSold),
                    String(ico.data.startDate),
                    String(Date.now()),
                    String(ico.data.endDate)
                ).status === "Sold Out";
            });

            soldoutlaunchpads.sort((a, b) => (a.data.startDate > b.data.startDate ? -1 : 1));
            
            let closedlaunchpads = filteredIcos.filter((ico) => {
                return getStatus(
                    Number(ico.data.isClosed),
                    Number(ico.data.amount),
                    Number(ico.data.totalSold),
                    String(ico.data.startDate),
                    String(Date.now()),
                    String(ico.data.endDate)
                ).status === "Closed";
            });

            closedlaunchpads.sort((a, b) => (a.data.startDate > b.data.startDate ? -1 : 1));

            let endedlaunchpads = filteredIcos.filter((ico) => {
                return getStatus(
                    Number(ico.data.isClosed),
                    Number(ico.data.amount),
                    Number(ico.data.totalSold),
                    String(ico.data.startDate),
                    String(Date.now()),
                    String(ico.data.endDate)
                ).status === "Ended";
            });

            endedlaunchpads.sort((a, b) => (a.data.startDate > b.data.startDate ? -1 : 1));

            let combined = [...livelaunchpads, ...upcominglaunchpads, ...soldoutlaunchpads, ...endedlaunchpads, ...closedlaunchpads];

            data.value.setData([...combined]);
        } catch (e: any) {
            data.value.setError();
        }
    };

    watch(publicKey, fetchData);
</script>
