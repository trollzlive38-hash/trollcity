import React, { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DollarSign, Settings, Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export default function EarningsConfigPanel({ currentUser }) {
  const qc = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  // Fetch current earnings config
  const { data: config, isLoading } = useQuery({
    queryKey: ['earningsConfig'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('earnings_config')
        .select('*')
        .eq('id', 1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Form state
  const [formData, setFormData] = useState(config || {});

  // Update config mutation
  const updateMutation = useMutation(
    async () => {
      const { error } = await supabase
        .from('earnings_config')
        .update({
          ...formData,
          updated_at: new Date().toISOString(),
          updated_by: currentUser?.id,
        })
        .eq('id', 1);
      if (error) throw error;
    },
    {
      onSuccess: () => {
        qc.invalidateQueries(['earningsConfig']);
        toast.success('Earnings config updated successfully');
        setIsEditing(false);
      },
      onError: (err) => {
        toast.error(err?.message || 'Failed to update config');
      },
    }
  );

  // Sync form when config loads
  React.useEffect(() => {
    if (config) setFormData(config);
  }, [config]);

  if (isLoading) return <div className="text-gray-400">Loading config...</div>;

  return (
    <Card className="bg-[#1a1a24] border-[#2a2a3a]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Settings className="w-5 h-5" />
          Earnings Configuration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="tiers" className="space-y-4">
          <TabsList className="bg-[#0a0a0f]">
            <TabsTrigger value="tiers">Payout Tiers</TabsTrigger>
            <TabsTrigger value="fees">Transaction Fees</TabsTrigger>
            <TabsTrigger value="square">Square Setup</TabsTrigger>
          </TabsList>

          {/* Payout Tiers Tab */}
          <TabsContent value="tiers" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Bronze */}
              <div>
                <Label className="text-gray-300">Bronze Tier Requirement (coins)</Label>
                <Input
                  type="number"
                  value={formData.bronze_tier_requirement || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bronze_tier_requirement: parseInt(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                />
              </div>
              <div>
                <Label className="text-gray-300">Bronze Payout ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.bronze_tier_payout || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      bronze_tier_payout: parseFloat(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                />
              </div>

              {/* Silver */}
              <div>
                <Label className="text-gray-300">Silver Tier Requirement (coins)</Label>
                <Input
                  type="number"
                  value={formData.silver_tier_requirement || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      silver_tier_requirement: parseInt(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                />
              </div>
              <div>
                <Label className="text-gray-300">Silver Payout ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.silver_tier_payout || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      silver_tier_payout: parseFloat(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                />
              </div>

              {/* Gold */}
              <div>
                <Label className="text-gray-300">Gold Tier Requirement (coins)</Label>
                <Input
                  type="number"
                  value={formData.gold_tier_requirement || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      gold_tier_requirement: parseInt(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                />
              </div>
              <div>
                <Label className="text-gray-300">Gold Payout ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.gold_tier_payout || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      gold_tier_payout: parseFloat(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                />
              </div>

              {/* Platinum */}
              <div>
                <Label className="text-gray-300">Platinum Tier Requirement (coins)</Label>
                <Input
                  type="number"
                  value={formData.platinum_tier_requirement || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      platinum_tier_requirement: parseInt(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                />
              </div>
              <div>
                <Label className="text-gray-300">Platinum Payout ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.platinum_tier_payout || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      platinum_tier_payout: parseFloat(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                />
              </div>
            </div>
          </TabsContent>

          {/* Transaction Fees Tab */}
          <TabsContent value="fees" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-300">Transaction Fee (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.transaction_fee_percentage || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      transaction_fee_percentage: parseFloat(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                />
                <p className="text-xs text-gray-500 mt-1">Percentage of transaction</p>
              </div>
              <div>
                <Label className="text-gray-300">Fixed Fee (cents)</Label>
                <Input
                  type="number"
                  value={formData.transaction_fee_fixed_cents || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      transaction_fee_fixed_cents: parseInt(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                />
                <p className="text-xs text-gray-500 mt-1">Fixed fee per transaction</p>
              </div>
              <div>
                <Label className="text-gray-300">Minimum Payout ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.minimum_payout || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      minimum_payout: parseFloat(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                />
              </div>
              <div>
                <Label className="text-gray-300">Processing Days</Label>
                <Input
                  type="number"
                  value={formData.payment_processing_days || 0}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      payment_processing_days: parseInt(e.target.value),
                    })
                  }
                  disabled={!isEditing}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                />
              </div>
            </div>
          </TabsContent>

          {/* Square Setup Tab */}
          <TabsContent value="square" className="space-y-4">
            <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg mb-4">
              <p className="text-sm text-gray-300">
                Configure your Square account to process all transactions with built-in fee handling.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <Label className="flex items-center gap-2 text-gray-300">
                  <input
                    type="checkbox"
                    checked={formData.square_account_active || false}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        square_account_active: e.target.checked,
                      })
                    }
                    disabled={!isEditing}
                    className="w-4 h-4"
                  />
                  Square Account Active
                </Label>
              </div>
              <div>
                <Label className="text-gray-300">Square Application ID</Label>
                <Input
                  type="text"
                  value={formData.square_application_id || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      square_application_id: e.target.value,
                    })
                  }
                  disabled={!isEditing}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                  placeholder="sq0atp-..."
                />
              </div>
              <div>
                <Label className="text-gray-300">Square Location ID</Label>
                <Input
                  type="text"
                  value={formData.square_location_id || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      square_location_id: e.target.value,
                    })
                  }
                  disabled={!isEditing}
                  className="bg-[#0a0a0f] border-[#2a2a3a] text-white"
                  placeholder="LVALUE..."
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-6">
          {!isEditing ? (
            <Button
              onClick={() => setIsEditing(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Settings className="w-4 h-4 mr-2" />
              Edit Settings
            </Button>
          ) : (
            <>
              <Button
                onClick={() => {
                  setFormData(config);
                  setIsEditing(false);
                }}
                variant="outline"
                className="border-[#2a2a3a] text-gray-300 hover:bg-[#1a1a24]"
              >
                Cancel
              </Button>
              <Button
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Save className="w-4 h-4 mr-2" />
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
