
import React from "react";
import { supabase } from "@/api/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coins, Users, Radio, MessageCircle, UserPlus, UserMinus, Crown, Shield, Calendar, DollarSign } from "lucide-react"; // Added DollarSign
import { toast } from "sonner";
import { useNavigate, Link } from "react-router-dom"; // Added Link
import { createPageUrl } from "@/utils";
import OGBadge from "../components/OGBadge";
import TrollFamilyBadge from "../components/TrollFamilyBadge";

export default function PublicProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const userId = urlParams.get("userId");
  const isValidUuid = typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => supabase.auth.me(),
  });

  const { data: profileUser, isLoading } = useQuery({
    queryKey: ['publicProfile', userId],
    queryFn: async () => {
      if (!userId || !isValidUuid) return null;
      // Primary: fetch from profiles table
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .limit(1);
      if (!error && data && data[0]) return data[0];
      // Fallback: legacy entity
      try {
        const users = await supabase.entities?.User?.filter ? await supabase.entities.User.filter({ id: userId }) : [];
        return users[0] || null;
      } catch (_) {
        return null;
      }
    },
    enabled: !!userId && isValidUuid,
  });

  // Fetch recent streams for display
  const { data: recentStreams = [] } = useQuery({
    queryKey: ['recentStreams', userId],
    queryFn: async () => {
      if (!userId || !isValidUuid) return [];
      return await supabase.entities.Stream.filter({ 
        streamer_id: userId 
      }, "-created_date", 5);
    },
    enabled: !!userId && isValidUuid,
    initialData: [],
  });

  const { data: myRecentStreams = [] } = useQuery({
    queryKey: ['userRecentStreams', profileUser?.id],
    queryFn: async () => {
      if (!profileUser?.id || !isValidUuid) return [];
      return await supabase.entities.Stream.filter({ 
        streamer_id: profileUser.id 
      }, "-created_date", 5);
    },
    enabled: !!profileUser?.id && isValidUuid,
    initialData: [],
  });

  // FIXED: Calculate total streaming hours
  const totalStreamingHours = React.useMemo(() => {
    if (!myRecentStreams.length) return 0;
    
    let totalMinutes = 0;
    myRecentStreams.forEach(stream => {
      if (stream.created_date) {
        const startTime = new Date(stream.created_date);
        const endTime = stream.updated_date ? new Date(stream.updated_date) : new Date();
        const durationMs = endTime - startTime;
        totalMinutes += Math.floor(durationMs / 1000 / 60);
      }
    });
    
    return (totalMinutes / 60).toFixed(1);
  }, [myRecentStreams]);


  const { data: isFollowing = false } = useQuery({
    queryKey: ['isFollowing', currentUser?.id, userId],
    queryFn: async () => {
      if (!currentUser || !userId || !isValidUuid) return false;
      const follows = await supabase.entities.Follow.filter({
        follower_id: currentUser.id,
        following_id: userId
      });
      return follows.length > 0;
    },
    enabled: !!currentUser && !!userId && isValidUuid,
  });

  const followMutation = useMutation({
    mutationFn: async () => {
      if (isFollowing) {
        const follows = await supabase.entities.Follow.filter({
          follower_id: currentUser.id,
          following_id: userId
        });
        if (follows[0]) {
          await supabase.entities.Follow.delete(follows[0].id);
        }
        // Update follower/following counts in profiles table
        const { error: unfollowTargetErr } = await supabase
          .from('profiles')
          .update({ follower_count: (profileUser.follower_count || 0) - 1 })
          .eq('id', userId);
        if (unfollowTargetErr) throw unfollowTargetErr;
        const { error: unfollowSelfErr } = await supabase
          .from('profiles')
          .update({ following_count: (currentUser.following_count || 0) - 1 })
          .eq('id', currentUser.id);
        if (unfollowSelfErr) throw unfollowSelfErr;
      } else {
        await supabase.entities.Follow.create({
          follower_id: currentUser.id,
          follower_name: currentUser.full_name,
          follower_username: currentUser.username,
          follower_avatar: currentUser.avatar,
          following_id: userId,
          following_name: profileUser.full_name,
          following_username: profileUser.username,
          following_avatar: profileUser.avatar
        });
        const { error: followTargetErr } = await supabase
          .from('profiles')
          .update({ follower_count: (profileUser.follower_count || 0) + 1 })
          .eq('id', userId);
        if (followTargetErr) throw followTargetErr;
        const { error: followSelfErr } = await supabase
          .from('profiles')
          .update({ following_count: (currentUser.following_count || 0) + 1 })
          .eq('id', currentUser.id);
        if (followSelfErr) throw followSelfErr;
        
        // Send notification
        await supabase.entities.Notification.create({
          user_id: userId,
          type: "new_follower",
          title: "New Follower",
          message: `${currentUser.username || currentUser.full_name} started following you!`,
          icon: "👥",
          related_user_id: currentUser.id,
          related_user_name: currentUser.username || currentUser.full_name,
          is_read: false
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['isFollowing']);
      queryClient.invalidateQueries(['publicProfile']);
      queryClient.invalidateQueries(['currentUser']);
      toast.success(isFollowing ? "Unfollowed" : "Following!");
    },
  });

  const startConversation = async () => {
    // ADDED: Admin can message anyone regardless of privacy settings
    if (profileUser.messages_closed && currentUser?.role !== 'admin') {
      toast.error("This user has closed their messages");
      return;
    }

    if (profileUser.messages_closed && currentUser?.role === 'admin') {
      toast.info("🛡️ Admin access: Messaging user with closed messages");
    }

    // Check if conversation already exists
    const existingConv = await supabase.entities.Conversation.filter({
      participant1_id: currentUser.id,
      participant2_id: userId
    });
    
    const existingConv2 = await supabase.entities.Conversation.filter({
      participant1_id: userId,
      participant2_id: currentUser.id
    });

    if (existingConv[0] || existingConv2[0]) {
      navigate(createPageUrl("Messages"));
      return;
    }

    // Create new conversation
    await supabase.entities.Conversation.create({
      participant1_id: currentUser.id,
      participant1_name: currentUser.full_name,
      participant1_username: currentUser.username,
      participant1_avatar: currentUser.avatar,
      participant1_created_date: currentUser.created_date,
      participant1_troll_family_id: currentUser.troll_family_id,
      participant1_troll_family_name: currentUser.troll_family_name,
      participant2_id: userId,
      participant2_name: profileUser.full_name,
      participant2_username: profileUser.username,
      participant2_avatar: profileUser.avatar,
      participant2_created_date: profileUser.created_date,
      participant2_troll_family_id: profileUser.troll_family_id,
      participant2_troll_family_name: profileUser.troll_family_name,
      last_message: "",
      last_message_time: new Date().toISOString(),
      unread_count_p1: 0,
      unread_count_p2: 0
    });

    navigate(createPageUrl("Messages"));
  };

  if (!userId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a0a1f] to-[#0a0a0f] flex items-center justify-center p-6">
        <Card className="bg-[#1a1a24] border-[#2a2a3a] p-8 text-center">
          <p className="text-white">No user specified</p>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a0a1f] to-[#0a0a0f] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a0a1f] to-[#0a0a0f] flex items-center justify-center p-6">
        <Card className="bg-[#1a1a24] border-[#2a2a3a] p-8 text-center">
          <p className="text-white">User not found</p>
        </Card>
      </div>
    );
  }

  const isOwnProfile = currentUser?.id === userId;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#1a0a1f] to-[#0a0a0f] p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Profile Header */}
        <Card className="bg-[#1a1a24] border-[#2a2a3a] p-8 mb-6">
          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* Avatar */}
            <div className="relative">
              {profileUser.avatar ? (
                <img
                  src={profileUser.avatar}
                  alt="Avatar"
                  className="w-32 h-32 rounded-full object-cover ring-4 ring-purple-500"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center ring-4 ring-purple-500">
                  <span className="text-5xl font-bold text-white">
                    {profileUser.username?.[0]?.toUpperCase() || profileUser.full_name?.[0]?.toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* User Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <h1 className="text-3xl font-bold text-white">
                  @{profileUser.username || "NoUsername"}
                </h1>
                <Badge className="bg-purple-500 text-white">
                  Level {profileUser.level || 1}
                </Badge>
                <OGBadge user={profileUser} />
                {profileUser.is_troll_officer && (
                  <Badge className="bg-orange-500 text-white">
                    <Shield className="w-3 h-3 mr-1" />
                    Officer
                  </Badge>
                )}
                {profileUser.troll_family_name && (
                  <TrollFamilyBadge familyName={profileUser.troll_family_name} />
                )}
              </div>
              
              <p className="text-gray-400 mb-4">{profileUser.bio || "No bio yet"}</p>
              
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="bg-[#0a0a0f] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Coins className="w-4 h-4 text-yellow-400" />
                    <span className="text-xs text-gray-400">Level</span>
                  </div>
                  <p className="text-lg font-bold text-purple-400">
                    {profileUser.level || 1}
                  </p>
                </div>
                <Link 
                  to={createPageUrl("Followers") + `?userId=${profileUser.id}`}
                  className="bg-[#0a0a0f] rounded-lg p-3 hover:bg-[#1a1a24] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-purple-400" />
                    <span className="text-xs text-gray-400">Followers</span>
                  </div>
                  <p className="text-lg font-bold text-purple-400">
                    {profileUser.follower_count || 0}
                  </p>
                </Link>
                <div className="bg-[#0a0a0f] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Radio className="w-4 h-4 text-red-400" />
                    <span className="text-xs text-gray-400">Streams</span>
                  </div>
                  <p className="text-lg font-bold text-red-400">
                    {profileUser.total_streams || 0}
                  </p>
                </div>
                <div className="bg-[#0a0a0f] rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-gray-400">Earned</span>
                  </div>
                  <p className="text-lg font-bold text-green-400">
                    ${((profileUser.earned_coins || 0) * 0.00625).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              {!isOwnProfile && currentUser && (
                <div className="flex gap-3">
                  <Button
                    onClick={() => followMutation.mutate()}
                    disabled={followMutation.isPending}
                    className={isFollowing ? "bg-gray-600 hover:bg-gray-700" : "bg-purple-600 hover:bg-purple-700"}
                  >
                    {isFollowing ? (
                      <>
                        <UserMinus className="w-4 h-4 mr-2" />
                        Unfollow
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4 mr-2" />
                        Follow
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={startConversation}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Message
                  </Button>
                </div>
              )}

              {isOwnProfile && (
                <Button
                  onClick={() => navigate(createPageUrl("Profile"))}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  Edit Profile
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Additional Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Streaming Stats */}
          <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Radio className="w-5 h-5 text-red-400" />
              Streaming Stats
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#0a0a0f] rounded-lg p-4 text-center">
                <p className="text-gray-400 text-sm mb-1">Total Streams</p>
                <p className="text-2xl font-bold text-white">{myRecentStreams.length}</p>
              </div>
              <div className="bg-[#0a0a0f] rounded-lg p-4 text-center">
                <p className="text-gray-400 text-sm mb-1">Hours Streamed</p>
                <p className="text-2xl font-bold text-white">{totalStreamingHours}h</p>
              </div>
              <div className="bg-[#0a0a0f] rounded-lg p-4 text-center">
                <p className="text-gray-400 text-sm mb-1">Experience</p>
                <p className="text-2xl font-bold text-purple-400">{profileUser.streaming_hours || 0}h</p>
              </div>
            </div>
          </Card>

          {profileUser.troll_family_name && (
            <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-400" />
                Troll Family
              </h3>
              <div className="space-y-3">
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                  <p className="text-purple-300 font-semibold text-lg">{profileUser.troll_family_name}</p>
                  {profileUser.owns_troll_family && (
                    <Badge className="mt-2 bg-yellow-500">
                      <Crown className="w-3 h-3 mr-1" />
                      Owner
                    </Badge>
                  )}
                </div>
                <Button
                  onClick={() => navigate(createPageUrl("TrollFamily"))}
                  variant="outline"
                  className="w-full border-purple-500 text-purple-400"
                >
                  View Family
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Recent Streams Section */}
        {recentStreams.length > 0 && (
          <Card className="bg-[#1a1a24] border-[#2a2a3a] p-6 mt-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Radio className="w-5 h-5 text-red-400" />
              Recent Streams
            </h3>
            <div className="space-y-3">
              {recentStreams.map((stream) => (
                <div 
                  key={stream.id}
                  onClick={() => {
                    if (stream.is_live) {
                      navigate(createPageUrl("StreamViewer") + `?id=${stream.id}`);
                    }
                  }}
                  className={`bg-[#0a0a0f] rounded-lg p-4 border border-[#2a2a3a] ${
                    stream.is_live ? 'cursor-pointer hover:border-purple-500 transition-all' : ''
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {stream.thumbnail ? (
                      <img 
                        src={stream.thumbnail} 
                        alt={stream.title}
                        className="w-24 h-16 rounded object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-24 h-16 rounded bg-gradient-to-br from-purple-900/50 to-pink-900/50 flex items-center justify-center flex-shrink-0">
                        <Radio className="w-6 h-6 text-white/50" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-white font-semibold truncate">{stream.title}</h4>
                        {stream.is_live ? (
                          <Badge className="bg-red-500 text-white text-xs flex-shrink-0">
                            <Radio className="w-3 h-3 mr-1 animate-pulse" />
                            LIVE
                          </Badge>
                        ) : (
                          <Badge className="bg-gray-600 text-white text-xs flex-shrink-0">
                            Ended
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(stream.created_date).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                        <span>
                          {new Date(stream.created_date).toLocaleTimeString('en-US', { 
                            hour: 'numeric', 
                            minute: '2-digit',
                            hour12: true
                          })}
                        </span>
                        <Badge className="bg-purple-500/20 text-purple-300 text-xs">
                          {stream.category}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className="text-gray-500 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {stream.viewer_count || 0} viewers
                        </span>
                        {stream.total_gifts > 0 && (
                          <span className="text-yellow-400 flex items-center gap-1">
                            🎁 {stream.total_gifts} gifts
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
