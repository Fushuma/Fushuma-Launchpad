<script setup lang="ts">
import { ref, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useWallet } from 'solana-wallets-vue';
import { nextTick, onMounted } from 'vue';

const showModal = ref(false);
const showAllWallets = ref(false);
const walletType = ref<string>("evm");
const ethAddress = ref<string | null>(null);
const solAddress = ref<string | null>(null);

const { publicKey, select,wallet, wallets } = useWallet();

let shortEthAddress = computed(() =>
  (ethAddress.value && walletType.value == "evm") ? `EVM: ${ethAddress.value.slice(0, 6)}...${ethAddress.value.slice(-4)}` : ''
);
let shortSolAddress = computed(() =>
  (solAddress.value && walletType.value == "solana") ? `Solana ${solAddress.value.slice(0, 4)}...${solAddress.value.slice(-4)}` : ''
);


onMounted(async() => {
  const metamask = getMetaMaskProvider();
  if (metamask && metamask.on) {

    const accounts = await metamask.request({ method: 'eth_accounts' });
    if (accounts && accounts.length > 0) {
      ethAddress.value = accounts[0];
      walletType.value = "evm";
    } else {
      ethAddress.value = null;
      walletType.value = "";
    }

    metamask.on('accountsChanged', (accounts: string[]) => {
      ethAddress.value = accounts[0] || null;
      walletType.value = accounts.length > 0 ? 'evm' : '';
    });

    // Optional: handle network changes
    metamask.on('chainChanged', (chainId: string) => {
      console.log('[MetaMask] Chain changed:', chainId);
      window.location.reload(); // reload to reinitialize provider state
    });
  }
});


function getMetaMaskProvider(): any {
  const { ethereum } = window as any;
  if (!ethereum) return null;

  if (ethereum.providers?.length) {
    return ethereum.providers.find((p: any) => p.isMetaMask);
  }

  return ethereum?.isMetaMask ? ethereum : null;
}


const detectedWallets = computed(() => {
  const detectedWallets = [];
  let filteredWallets: any[] = [];
  wallets.value.map(wallet => {
    if (!filteredWallets.some((wall: any) => wall.adapter.name === wallet.adapter.name)) {
      filteredWallets.push(wallet);
    }
  })
  for (const wallet of filteredWallets) {
    console.log("Detected wallet:", filteredWallets);
    if (wallet?.readyState == 'Installed') {
      detectedWallets.push({
        name: wallet.adapter.name,
        type: wallet.adapter.name == "MetaMask" ? "evm" : "solana"
      });
    }
  }

  return detectedWallets;
});

const undetectedWallets = computed(() => {
  const all = [
    { name: 'MetaMask', type: 'evm' },
    { name: 'Phantom', type: 'solana' },
    { name: 'Solflare', type: 'solana' },
    { name: 'Backpack', type: 'solana' }
  ];
  return all.filter(
    (w) => !detectedWallets.value.some((d) => d.name === w.name)
  );
});

// Connect wallet
const selectWallet = async (type: 'evm' | 'solana', walletName: any) => {
  showModal.value = false;
  if (type === 'evm') {
    try {
      const ethereum = (window as any).ethereum;
      const provider = ethereum?.providers?.find((p: any) => p.isMetaMask) || ethereum;
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      ethAddress.value = accounts[0];
      walletType.value = "evm";
    } catch (err) {
      alert('MetaMask connect failed.');
    }
  } else if (type === 'solana') {
    try {
       console.log("Selected wallet:", walletName);
      select(walletName); // switches to the selected Solana wallet

      // Optional: wait a tick in case UI updates lag
      await nextTick();

      // Wait until the publicKey is available
      let retries = 10;
      while (!publicKey.value && retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        retries--;
      }

      if (publicKey.value) {
        solAddress.value = publicKey.value.toString();
        walletType.value = 'solana';
        console.log('✅ Connected Solana wallet:', solAddress.value);
      } else {
        console.warn('⚠️ publicKey not available after wallet selection.');
      }
    } catch (err) {
      alert('Solana connect failed.');
    }
  }
};

</script>


<template>
  <!-- Connect Wallet Button -->
  <button
    @click="showModal = true"
    class="bg-[#da342e] hover:bg-[#c42f29] text-white px-5 py-3 font-medium flex items-center gap-2 shadow-md transition"
  >
    <Icon icon="mdi:wallet" class="w-5 h-5" />
    <span style="font-family: 'Expletus Sans', sans-serif;">
      {{ shortEthAddress || shortSolAddress || 'Connect Wallet' }}
    </span>
  </button>

  <!-- Wallet Modal -->
  <div v-if="showModal" class="fixed inset-0 z-50 flex justify-center items-center">
    <!-- Semi-transparent white background -->
    <div class="absolute inset-0 backdrop-blur-sm"></div>

    <div class="relative bg-white shadow-lg w-full max-w-md z-10" style="border: 1px solid #bdbdbd; background: #f3f2ed;">
      <!-- Modal Header -->
      <div class="flex items-center justify-between p-4">
        <h2 class="text-lg font-semibold" style="font-family: 'Expletus Sans', sans-serif; font-size: 20px;">Connect Wallet</h2>
        <button @click="showModal = false" class="text-gray-500 text-xl hover:text-gray-700">&times;</button>
      </div>

      <!-- Wallet Options -->
      <div class="p-4 space-y-2">
        <!-- Detected Wallets -->
        <div v-for="wallet in detectedWallets" :key="wallet.name">
          <button
            @click="selectWallet(wallet.type as 'evm'|'solana', wallet.name)"
            class="flex items-center justify-between w-full px-4 py-2 text-sm hover:bg-gray-100"
            style="border: 1px solid rgb(207 207 207); border-radius: 0; padding: 15px 10px; background: rgb(235 234 225);"
          >
            <span style="font-family: 'Expletus Sans', sans-serif;">{{ wallet.name }}</span>
            <span class="text-green-600 text-xs font-medium" style="font-family: 'Expletus Sans', sans-serif;">Detected</span>
          </button>
        </div>

        <!-- Toggle More Options -->
        <div v-if="!showAllWallets">
          <button
            @click="showAllWallets = true"
            class="text-sm text-blue-500 hover:underline mt-2"
          >
            More options
          </button>
        </div>

        <!-- Undetected Wallets -->
        <div v-if="showAllWallets" class="space-y-2">
          <div v-for="wallet in undetectedWallets" :key="wallet.name">
            <button
              disabled
              class="flex items-center justify-between w-full px-4 py-2 text-sm bg-gray-50 text-gray-400 cursor-not-allowed"
              style="border: 1px solid rgb(207 207 207); border-radius: 0; padding: 15px 10px; background: #e9e9e9;"
              >
              <span style="font-family: 'Expletus Sans', sans-serif;">{{ wallet.name }}</span>
              <span style="font-family: 'Expletus Sans', sans-serif;" class="text-xs">Not Detected</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>